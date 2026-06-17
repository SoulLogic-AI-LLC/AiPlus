import { describe, expect, test, afterAll } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import http from "http"
import fs from "fs/promises"
import path from "path"
import WebSocket, { WebSocketServer } from "ws"
import { createWebSocketEventSource } from "../../src/cli/tui/daemon-transport"

const portFilePath = path.join(Global.Path.data, "daemon.port")
const backupPath = portFilePath + ".test-backup"

async function savePortFile(): Promise<boolean> {
  try {
    await fs.copyFile(portFilePath, backupPath)
    return true
  } catch {
    return false
  }
}

async function restorePortFile() {
  try {
    await fs.rename(backupPath, portFilePath)
  } catch {
    try { await fs.unlink(portFilePath) } catch {}
  }
}

async function writePortFile(port: number) {
  const dir = path.dirname(portFilePath)
  await fs.mkdir(dir, { recursive: true })
  const temp = portFilePath + "." + Math.random().toString(36).slice(2) + ".tmp"
  await fs.writeFile(temp, JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }), { mode: 0o600 })
  await fs.rename(temp, portFilePath)
}

/** Start an HTTP server that responds to /global/health and upgrades to WebSocket. */
function startDaemonServer(): Promise<{ port: number; ws: WebSocketServer; http: http.Server; connections: number }> {
  return new Promise((resolve) => {
    const state = { connections: 0 }
    const httpServer = http.createServer((req, res) => {
      if (req.url === "/global/health") {
        res.writeHead(200).end("ok")
      }
    })
    const wss = new WebSocketServer({ server: httpServer })
    wss.on("connection", () => { state.connections++ })
    httpServer.listen(0, () => {
      const addr = httpServer.address() as { port: number }
      resolve({ port: addr.port, ws: wss, http: httpServer, get connections() { return state.connections } })
    })
  })
}

afterAll(async () => {
  await restorePortFile()
})

describe("daemon-transport WebSocket heartbeat", () => {
  test("sends periodic ping messages", async () => {
    const wss = new WebSocketServer({ port: 0 })
    try {
      const address = wss.address() as WebSocket.AddressInfo
      const port = address.port
      const pings: Array<{ type: string }> = []

      wss.on("connection", (socket) => {
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString()) as { type: string }
          if (message.type === "ping") pings.push(message)
        })
      })

      const previousInterval = process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
      process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = "100"
      const unsubscribe = await createWebSocketEventSource(`http://127.0.0.1:${port}`, undefined).subscribe(() => {})

      await new Promise((resolve) => setTimeout(resolve, 350))
      await unsubscribe()

      if (previousInterval === undefined) delete process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
      else process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = previousInterval

      expect(pings.length).toBeGreaterThanOrEqual(2)
      expect(pings[0]).toEqual({ type: "ping" })
    } finally {
      wss.close()
    }
  })

  test("disabled when interval is 0", async () => {
    const wss = new WebSocketServer({ port: 0 })
    try {
      const address = wss.address() as WebSocket.AddressInfo
      const port = address.port
      const pings: Array<{ type: string }> = []

      wss.on("connection", (socket) => {
        socket.on("message", (data) => {
          const message = JSON.parse(data.toString()) as { type: string }
          if (message.type === "ping") pings.push(message)
        })
      })

      const previousInterval = process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
      process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = "0"
      const unsubscribe = await createWebSocketEventSource(`http://127.0.0.1:${port}`, undefined).subscribe(() => {})

      await new Promise((resolve) => setTimeout(resolve, 250))
      await unsubscribe()

      if (previousInterval === undefined) delete process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
      else process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = previousInterval

      expect(pings.length).toBe(0)
    } finally {
      wss.close()
    }
  })
})

describe("daemon-transport port rediscovery", () => {
  test("reconnects to new port after daemon port file changes", async () => {
    await savePortFile()

    // Server A: initial connection target
    const serverA = await startDaemonServer()

    // Disable heartbeat to avoid timer noise during fast disconnect/reconnect
    const previousInterval = process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
    process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = "0"

    const unsubscribe = await createWebSocketEventSource(`http://127.0.0.1:${serverA.port}`, undefined).subscribe(() => {})

    // Verify initial connection succeeded
    expect(serverA.connections).toBe(1)

    // Simulate daemon dying and restarting on a new port:
    // 1. Kill server A — close WS connections first so the client sees the close event
    serverA.ws.clients.forEach((c) => c.close())
    serverA.ws.close()
    serverA.http.close()

    // 2. Start server B on a different port
    const serverB = await startDaemonServer()

    // 3. Update the port file to point to server B
    await writePortFile(serverB.port)

    // 4. Wait for the client to reconnect.
    //    Exponential backoff starts at 1s. First reconnect attempt reads port file,
    //    finds server B alive via /global/health, and reconnects.
    await new Promise((resolve) => setTimeout(resolve, 2500))

    await unsubscribe()

    if (previousInterval === undefined) delete process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
    else process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS = previousInterval

    serverB.http.close()
    serverB.ws.close()

    // Client should have reconnected to server B
    expect(serverB.connections).toBeGreaterThanOrEqual(1)
  }, 15000)
})
