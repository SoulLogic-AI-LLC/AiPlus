import { afterEach, describe, expect, test } from "bun:test"
import http from "http"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { cleanupStaleDaemonPort, daemonPort, daemonSpawnCommand, isAllowedDaemonCommand } from "../../src/cli/daemon-port"

const originalDaemonPort = process.env.OPENCODE_DAEMON_PORT

afterEach(() => {
  if (originalDaemonPort === undefined) delete process.env.OPENCODE_DAEMON_PORT
  else process.env.OPENCODE_DAEMON_PORT = originalDaemonPort
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

  test("allowlists canonical daemon command names", () => {
    expect(isAllowedDaemonCommand("/usr/local/bin/aiplus-daemon daemon")).toBe(true)
    expect(isAllowedDaemonCommand("/usr/local/bin/aiplus-native daemon")).toBe(true)
    expect(isAllowedDaemonCommand("bun /repo/packages/opencode/src/index.ts daemon")).toBe(true)
    expect(isAllowedDaemonCommand("python -m http.server")).toBe(false)
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
})
