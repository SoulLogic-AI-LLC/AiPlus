import { cmd } from "@/cli/cmd/cmd"
import { UI } from "@/cli/ui"
import { errorMessage } from "@opencode-ai/tui/util/error"
import { Filesystem } from "@/util/filesystem"
import { withNetworkOptions } from "@/cli/network"
import path from "path"
import { writeHeapSnapshot } from "v8"
import { validateSession } from "../tui/validate-session"
import { win32InstallCtrlCGuard } from "@opencode-ai/tui/terminal-win32"
import { Effect, Option } from "effect"
import { DaemonAuth } from "@/cli/daemon-auth"
import {
  clearDaemonPort,
  daemonPort,
  isDaemonAlive,
  probeDaemonPort,
  readDaemonPort,
  spawnDaemonProcess,
} from "@/cli/daemon-port"
import { createDaemonFetch, createHybridEventSource } from "../tui/daemon-transport"

async function input(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

function warnIgnoredDaemonNetworkFlags() {
  if (process.argv.includes("--port") || process.argv.includes("--hostname")) {
    console.warn("warning: daemon is running; ignoring --port/--hostname flags")
  }
}

export function resolveThreadDirectory(project?: string, envPWD = process.env.PWD, cwd = process.cwd()) {
  const root = Filesystem.resolve(envPWD ?? cwd)
  if (project) return Filesystem.resolve(path.isAbsolute(project) ? project : path.join(root, project))
  return Filesystem.resolve(cwd)
}

async function detectAndConnectDaemon(): Promise<{ url: string; auth: string | undefined } | null> {
  let mode = process.env.OPENCODE_DAEMON_MODE ?? "auto"
  const port = daemonPort()

  if (mode !== "auto" && mode !== "0" && mode !== "force" && mode !== "1" && mode !== "off") {
    console.warn(`unknown OPENCODE_DAEMON_MODE=${mode}, treating as auto`)
  }
  if (mode === "1") mode = "force"
  if (mode === "0") mode = "auto"
  if (mode === "off") {
    console.warn("OPENCODE_DAEMON_MODE=off is no longer supported; TUI now requires a daemon")
    mode = "auto"
  }

  const auth = await Effect.runPromise(DaemonAuth.readHeader())
  const portOpt = await Effect.runPromise(readDaemonPort())
  if (Option.isSome(portOpt) && portOpt.value.port !== port) {
    await Effect.runPromise(clearDaemonPort())
  }

  if (Option.isSome(portOpt) && portOpt.value.port === port) {
    const status = await Effect.runPromise(isDaemonAlive(portOpt.value))
    if (status === "alive") {
      warnIgnoredDaemonNetworkFlags()
      return { url: `http://127.0.0.1:${port}`, auth }
    }
    if (status === "unauthorized") {
      console.error("failed to connect to daemon: unauthorized (wrong password?)")
      if (mode === "force") {
        throw new Error("Daemon mode forced but daemon password is incorrect.")
      }
      return null
    }

    await Effect.runPromise(clearDaemonPort())
  }

  const status = await Effect.runPromise(probeDaemonPort(port))
  if (status === "alive") {
    warnIgnoredDaemonNetworkFlags()
    return { url: `http://127.0.0.1:${port}`, auth }
  }
  if (status === "unauthorized") {
    console.error("failed to connect to daemon: unauthorized (wrong password?)")
    if (mode === "force") {
      throw new Error("Daemon mode forced but daemon password is incorrect.")
    }
    return null
  }

  if (mode === "auto" || mode === "0" || !mode) {
    try {
      const spawned = await Effect.runPromise(spawnDaemonProcess())
      warnIgnoredDaemonNetworkFlags()
      return { url: spawned.url, auth: await Effect.runPromise(DaemonAuth.readHeader()) }
    } catch (error) {
      console.error("failed to auto-start daemon:", error)
    }
  }

  if (mode === "force" || mode === "1") {
    throw new Error("Daemon mode forced but no daemon found. Start one with: opencode daemon")
  }

  return null
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

      const next = resolveThreadDirectory(args.project)
      try {
        process.chdir(next)
      } catch {
        UI.error("Failed to change directory to " + next)
        return
      }
      const cwd = Filesystem.resolve(process.cwd())

      const daemon = await detectAndConnectDaemon()
      if (!daemon) {
        UI.error("无法连接或启动 daemon。请手动运行：opencode daemon")
        process.exitCode = 1
        return
      }

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
    } finally {
      try {
        unguard?.()
      } catch {}
    }
  },
})
