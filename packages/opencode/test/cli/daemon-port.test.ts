import { afterAll, afterEach, describe, expect, test } from "bun:test"
import http from "http"
import { Effect, Option } from "effect"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Global } from "@opencode-ai/core/global"
import {
  cleanupStaleDaemonPort,
  clearDaemonPort,
  daemonPort,
  daemonSpawnCommand,
  isAllowedDaemonCommand,
  isDaemonAlive,
  readDaemonPort,
  writeDaemonPort,
} from "../../src/cli/daemon-port"

const originalDaemonPort = process.env.OPENCODE_DAEMON_PORT
const originalAllowPath = process.env.OPENCODE_DAEMON_ALLOW_PATH

afterEach(() => {
  if (originalDaemonPort === undefined) delete process.env.OPENCODE_DAEMON_PORT
  else process.env.OPENCODE_DAEMON_PORT = originalDaemonPort
  if (originalAllowPath === undefined) delete process.env.OPENCODE_DAEMON_ALLOW_PATH
  else process.env.OPENCODE_DAEMON_ALLOW_PATH = originalAllowPath
})

function listenForeignServer() {
  return new Promise<http.Server>((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/global/health") {
        res.writeHead(404).end("not-daemon")
        return
      }

      res.writeHead(200).end("still-alive")
    })
    server.listen(0, () => resolve(server))
  })
}

describe("daemon port", () => {
  test("defaults to the fixed daemon port", () => {
    delete process.env.OPENCODE_DAEMON_PORT
    expect(daemonPort()).toBe(37367)
  })

  test("allows a debug port override", () => {
    process.env.OPENCODE_DAEMON_PORT = "40123"
    expect(daemonPort()).toBe(40123)
  })

  test("allows daemon command with allowed exe path and daemon subcommand", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/Users/steve/.local/bin"
    expect(isAllowedDaemonCommand("/Users/steve/.local/bin/aiplus-daemon", "aiplus-daemon daemon")).toBe(true)
  })

  test("allows daemon command in current runtime directory", () => {
    const execDir = path.dirname(process.execPath)
    expect(isAllowedDaemonCommand(path.join(execDir, "aiplus-daemon"), "aiplus-daemon daemon")).toBe(true)
  })

  test("rejects when exe path is unknown", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/Users/steve/.local/bin"
    expect(isAllowedDaemonCommand(undefined, "aiplus-daemon daemon")).toBe(false)
  })

  test("rejects command injection from /tmp even with matching args", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/tmp"
    expect(isAllowedDaemonCommand("/tmp/aiplus-daemon-fake", "aiplus-daemon-fake daemon")).toBe(false)
  })

  test("rejects daemon from /var/tmp", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/var/tmp"
    expect(isAllowedDaemonCommand("/var/tmp/aiplus-daemon", "aiplus-daemon daemon")).toBe(false)
  })

  test("rejects foreign process (python http.server on daemon port)", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/usr/bin"
    expect(isAllowedDaemonCommand("/usr/bin/python3", "python3 -m http.server 37367")).toBe(false)
  })

  test("rejects allowed exe path when args lack daemon subcommand", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/Users/steve/.local/bin"
    expect(isAllowedDaemonCommand("/Users/steve/.local/bin/aiplus-daemon", "aiplus-daemon status")).toBe(false)
  })

  test("honors OPENCODE_DAEMON_ALLOW_PATH override", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/custom/bin"
    expect(isAllowedDaemonCommand("/custom/bin/aiplus-daemon", "aiplus-daemon daemon")).toBe(true)
  })

  test("rejects paths not in OPENCODE_DAEMON_ALLOW_PATH", () => {
    process.env.OPENCODE_DAEMON_ALLOW_PATH = "/custom/bin"
    expect(isAllowedDaemonCommand("/other/bin/aiplus-daemon", "aiplus-daemon daemon")).toBe(false)
  })

  test("prefers sibling aiplus-daemon for compiled spawns", async () => {
    await using tmp = await tmpdir()
    const bin = path.join(tmp.path, "bin")
    const native = path.join(bin, "aiplus-native")
    const daemon = path.join(bin, "aiplus-daemon")
    await fs.mkdir(bin, { recursive: true })
    await fs.writeFile(native, "")
    await fs.writeFile(daemon, "")

    expect(daemonSpawnCommand(native)).toEqual({
      execPath: daemon,
      args: ["daemon"],
    })
  })

  test("keeps bun entrypoint spawning through bun", () => {
    expect(daemonSpawnCommand("/Users/test/.bun/bin/bun", "/repo/packages/opencode/src/index.ts")).toEqual({
      execPath: "/Users/test/.bun/bin/bun",
      args: ["/repo/packages/opencode/src/index.ts", "daemon"],
    })
  })

  test("never kills a foreign port owner", async () => {
    const server = await listenForeignServer()

    try {
      const address = server.address()
      if (!address || typeof address === "string") {
        throw new Error("expected TCP address")
      }

      await expect(Effect.runPromise(cleanupStaleDaemonPort(address.port))).rejects.toMatchObject({
        _tag: "CliDaemonPortBlockedError",
        pid: process.pid,
        port: address.port,
      })

      const response = await fetch(`http://127.0.0.1:${address.port}/still-alive`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe("still-alive")
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })

  test("preserves port file of a live daemon on a different port", async () => {
    // Start a server that mimics a daemon health endpoint
    const server = http.createServer((req, res) => {
      if (req.url === "/global/health") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ healthy: true }))
        return
      }
      res.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const addr = server.address()
    if (!addr || typeof addr === "string") throw new Error("expected TCP address")

    const portFilePath = path.join(Global.Path.data, "daemon.port")
    const backup = portFilePath + ".test-backup"

    try {
      // Backup existing port file
      try {
        await fs.copyFile(portFilePath, backup)
      } catch {}
      // Write a port file pointing to the fake daemon on its random port
      await Effect.runPromise(writeDaemonPort(addr.port))

      // Step 1: verify the port file exists
      const portOpt1 = await Effect.runPromise(readDaemonPort())
      expect(Option.isSome(portOpt1)).toBe(true)
      if (Option.isSome(portOpt1)) expect(portOpt1.value.port).toBe(addr.port)

      // Step 2: the daemon on the recorded port is alive
      const aliveStatus = await Effect.runPromise(
        isDaemonAlive({ port: addr.port, pid: process.pid, startedAt: Date.now() }),
      )
      expect(aliveStatus).toBe("alive")

      // Step 3: simulate the fixed spawnDaemonProcess/daemon-command logic:
      // when port file port !== daemonPort(), only clear if NOT alive
      const defaultPort = daemonPort()
      expect(addr.port).not.toBe(defaultPort)
      if (aliveStatus !== "alive") {
        await Effect.runPromise(clearDaemonPort())
      }

      // Step 4: port file must still exist (the live daemon on the different port was preserved)
      const portOpt2 = await Effect.runPromise(readDaemonPort())
      expect(Option.isSome(portOpt2)).toBe(true)
      if (Option.isSome(portOpt2)) expect(portOpt2.value.port).toBe(addr.port)
    } finally {
      server.close()
      // Restore backup
      try {
        await fs.rename(backup, portFilePath)
      } catch {
        try {
          await fs.unlink(portFilePath)
        } catch {}
      }
    }
  })

  test("clears port file of a dead daemon on a different port", async () => {
    const portFilePath = path.join(Global.Path.data, "daemon.port")
    const backup = portFilePath + ".test-backup"

    try {
      // Backup existing port file
      try {
        await fs.copyFile(portFilePath, backup)
      } catch {}
      // Write a port file pointing to a port where nothing is listening (unlikely to be alive)
      const deadPort = 65530
      await Effect.runPromise(writeDaemonPort(deadPort))

      // Verify daemon on recorded port is dead
      const aliveStatus = await Effect.runPromise(isDaemonAlive({ port: deadPort, pid: 99999, startedAt: Date.now() }))
      expect(aliveStatus).toBe("dead")

      // Simulate the fixed logic: clear only when dead
      if (aliveStatus !== "alive") {
        await Effect.runPromise(clearDaemonPort())
      }

      // Port file must be cleared
      const portOpt = await Effect.runPromise(readDaemonPort())
      expect(Option.isNone(portOpt)).toBe(true)
    } finally {
      // Restore backup (if clearDaemonPort succeeded, file won't exist)
      try {
        await fs.rename(backup, portFilePath)
      } catch {
        try {
          await fs.unlink(portFilePath)
        } catch {}
      }
    }
  })
})
