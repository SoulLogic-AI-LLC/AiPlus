import { describe, expect, test } from "bun:test"
import WebSocket, { WebSocketServer } from "ws"
import { createWebSocketEventSource } from "../../src/cli/tui/daemon-transport"

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
