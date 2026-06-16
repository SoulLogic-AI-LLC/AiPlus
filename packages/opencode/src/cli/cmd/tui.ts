import { cmd } from "@/cli/cmd/cmd"
import { Rpc } from "@/util/rpc"
import { type rpc } from "../tui/worker"
import path from "path"
import { fileURLToPath } from "url"
import { UI } from "@/cli/ui"
import { errorMessage } from "@opencode-ai/tui/util/error"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import type { EventSource } from "@opencode-ai/tui/context/sdk"
import { writeHeapSnapshot } from "v8"
import { validateSession } from "../tui/validate-session"
import { win32InstallCtrlCGuard } from "@opencode-ai/tui/terminal-win32"
import { Effect, Option } from "effect"
import { readDaemonPort, isDaemonAlive, clearDaemonPort, spawnDaemonProcess } from "@/cli/daemon-port"
import { ServerAuth } from "@/server/auth"
import { createDaemonFetch, createHybridEventSource } from "../tui/daemon-transport"

declare global {
  const OPENCODE_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    subscribe: async (handler) => {
      return client.on<GlobalEvent>("global.event", (e) => {
        handler(e)
      })
    },
  }
}

async function target() {
  if (typeof OPENCODE_WORKER_PATH !== "undefined") return OPENCODE_WORKER_PATH
  const dist = new URL("./cli/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("../tui/worker.ts", import.meta.url)
}

async function input(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

export function resolveThreadDirectory(project?: string, envPWD = process.env.PWD, cwd = process.cwd()) {
  const root = Filesystem.resolve(envPWD ?? cwd)
  if (project) return Filesystem.resolve(path.isAbsolute(project) ? project : path.join(root, project))
  return Filesystem.resolve(cwd)
}

async function detectAndConnectDaemon(): Promise<{ url: string; auth: string | undefined } | null> {
  let mode = process.env.OPENCODE_DAEMON_MODE ?? "auto"
  if (mode === "off") return null

  if (mode !== "auto" && mode !== "0" && mode !== "force" && mode !== "1") {
    console.warn(`unknown OPENCODE_DAEMON_MODE=${mode}, treating as auto`)
  }
  if (mode === "1") mode = "force"
  if (mode === "0") mode = "auto"

  const portOpt = await Effect.runPromise(readDaemonPort())
  if (Option.isNone(portOpt)) {
    if (mode === "auto" || mode === "0" || !mode) {
      try {
        const spawned = await Effect.runPromise(spawnDaemonProcess())
        if (spawned.type === "existing") {
          return { url: spawned.url, auth: ServerAuth.header() }
        }
        const deadline = Date.now() + 15000
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 500))
          const p = await Effect.runPromise(readDaemonPort())
          if (Option.isSome(p) && (await Effect.runPromise(isDaemonAlive(p.value))))
            return { url: `http://127.0.0.1:${p.value.port}`, auth: ServerAuth.header() }
        }
        console.warn("warning: daemon auto-start timed out; falling back to standalone mode")
      } catch (e) {
        console.error("failed to auto-start daemon:", e)
      }
    }

    if (mode === "force" || mode === "1")
      throw new Error("Daemon mode forced but no daemon found. Start one with: opencode daemon")
    return null
  }

  const portInfo = portOpt.value
  const alive = await Effect.runPromise(isDaemonAlive(portInfo))
  if (!alive) {
    await Effect.runPromise(clearDaemonPort())
    if (mode === "force") {
      throw new Error(
        "Daemon mode forced but daemon not responding. Stale port file removed; start a fresh daemon.",
      )
    }
    return null
  }

  if (process.argv.includes("--port") || process.argv.includes("--hostname")) {
    console.warn("warning: daemon is running; ignoring --port/--hostname flags")
  }
  const auth = ServerAuth.header()
  return { url: `http://127.0.0.1:${portInfo.port}`, auth }
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start opencode tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start opencode in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    const unguard = win32InstallCtrlCGuard()
    try {
      const { TuiConfig } = await import("@/config/tui")
      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session")
        process.exitCode = 1
        return
      }

      // Resolve relative --project paths from PWD, then use the real cwd after
      // chdir so the thread and worker share the same directory key.
      const next = resolveThreadDirectory(args.project)
      const file = await target()
      try {
        process.chdir(next)
      } catch {
        UI.error("Failed to change directory to " + next)
        return
      }
      const cwd = Filesystem.resolve(process.cwd())

      const daemon = await detectAndConnectDaemon()
      if (daemon) {
        const transport = {
          url: daemon.url,
          fetch: createDaemonFetch(daemon.url, daemon.auth),
          events: createHybridEventSource(daemon.url, daemon.auth),
        }
        try {
          await validateSession({
            url: transport.url,
            sessionID: args.session,
            directory: cwd,
            fetch: transport.fetch,
          })
        } catch (error) {
          UI.error(errorMessage(error))
          process.exitCode = 1
          return
        }
        try {
          const { run } = await import("../tui/layer")
          const { createLegacyTuiPluginHost } = await import("@/plugin/tui/runtime")
          await Effect.runPromise(
            run({
              url: transport.url,
              async onSnapshot() {
                return [writeHeapSnapshot("tui.heapsnapshot")]
              },
              config: await TuiConfig.get(),
              pluginHost: createLegacyTuiPluginHost(),
              directory: cwd,
              fetch: transport.fetch,
              events: transport.events,
              args: {
                continue: args.continue,
                sessionID: args.session,
                agent: args.agent,
                model: args.model,
                prompt: await input(args.prompt),
                fork: args.fork,
              },
            }),
          )
        } finally {
          // Daemon lifecycle is independent in Phase 1 — no shutdown call.
        }
        return
      }

      const worker = new Worker(file)
      const client = Rpc.client<typeof rpc>(worker)
      const reload = () => {
        client.call("reload", undefined).catch(() => {})
      }
      process.on("SIGUSR2", reload)

      let stopped = false
      const stop = async () => {
        if (stopped) return
        stopped = true
        process.off("SIGUSR2", reload)
        await withTimeout(client.call("shutdown", undefined), 5000).catch(() => {})
        worker.terminate()
      }

      const prompt = await input(args.prompt)
      const config = await TuiConfig.get()

      const network = resolveNetworkOptionsNoConfig(args)
      const external =
        process.argv.includes("--port") ||
        process.argv.includes("--hostname") ||
        process.argv.includes("--mdns") ||
        network.mdns ||
        network.port !== 0 ||
        network.hostname !== "127.0.0.1"

      const transport = external
        ? {
            url: (await client.call("server", network)).url,
            fetch: undefined,
            events: undefined,
          }
        : {
            url: "http://opencode.internal",
            fetch: createWorkerFetch(client),
            events: createEventSource(client),
          }

      try {
        await validateSession({
          url: transport.url,
          sessionID: args.session,
          directory: cwd,
          fetch: transport.fetch,
        })
      } catch (error) {
        UI.error(errorMessage(error))
        process.exitCode = 1
        return
      }

      setTimeout(() => {
        client.call("checkUpgrade", { directory: cwd }).catch(() => {})
      }, 1000).unref?.()

      try {
        const { Effect } = await import("effect")
        const { run } = await import("../tui/layer")
        const { createLegacyTuiPluginHost } = await import("@/plugin/tui/runtime")
        await Effect.runPromise(
          run({
            url: transport.url,
            async onSnapshot() {
              const tui = writeHeapSnapshot("tui.heapsnapshot")
              const server = await client.call("snapshot", undefined)
              return [tui, server]
            },
            config,
            pluginHost: createLegacyTuiPluginHost(),
            directory: cwd,
            fetch: transport.fetch,
            events: transport.events,
            args: {
              continue: args.continue,
              sessionID: args.session,
              agent: args.agent,
              model: args.model,
              prompt,
              fork: args.fork,
            },
          }),
        )
      } finally {
        await stop()
      }
    } finally {
      try {
        unguard?.()
      } catch {}
    }
    process.exit(0)
  },
})
