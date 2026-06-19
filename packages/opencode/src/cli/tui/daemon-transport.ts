import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import type { EventSource } from "@opencode-ai/tui/context/sdk"
import { Effect, Option } from "effect"
import WebSocket from "ws"
import { readDaemonPort, isDaemonAlive, type DaemonPort } from "@/cli/daemon-port"
import {
  decodeWsMessage,
  encodeWsMessage,
  wsPing,
  wsPong,
  type WsMessage,
} from "@/server/routes/instance/httpapi/handlers/global-ws"

/**
 * Daemon HTTP transport factories for the Phase 2 unified backend.
 *
 * Extracted from `cli/cmd/tui.ts` so the TUI handler diff stays small and
 * reviewable. Promoting these helpers to a sibling module also makes them
 * reusable from any future caller that needs to talk to a daemon over HTTP +
 * WebSocket (with SSE fallback).
 *
 * The SSE EventSource adapter reuses the opencode SDK's `createOpencodeClient` +
 * `client.global.event()` pair — the same SSE path the TUI SDK uses
 * internally at `tui/src/context/sdk.tsx:82-117`. By passing our own fetch
 * (auth-aware, base-URL-aware) into the SDK client, we get the SDK's
 * stream-parsing logic for free and just feed events to the TUI handler.
 *
 * The WebSocket EventSource adapter connects to `/global/ws`, responds to
 * server pings, and automatically reconnects with exponential backoff. The
 * hybrid source prefers WebSocket and falls back to SSE when WS is unavailable.
 */

const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000

function heartbeatIntervalMs() {
  const raw = process.env.OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS
  if (raw === undefined) return DEFAULT_HEARTBEAT_INTERVAL_MS
  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed < 0) {
    console.warn(`invalid OPENCODE_DAEMON_HEARTBEAT_INTERVAL_MS=${raw}, using default ${DEFAULT_HEARTBEAT_INTERVAL_MS}`)
    return DEFAULT_HEARTBEAT_INTERVAL_MS
  }
  return parsed
}

export function createDaemonFetch(url: string, auth: string | undefined) {
  const fn = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    if (auth && !headers.has("authorization") && !headers.has("Authorization")) {
      headers.set("Authorization", auth)
    }
    return globalThis.fetch(typeof input === "string" && !input.startsWith("http") ? `${url}${input}` : input, {
      ...init,
      headers,
    })
  }
  return fn as typeof fetch
}

export function createSSEEventSource(baseUrl: string, auth: string | undefined): EventSource {
  const client = createOpencodeClient({
    baseUrl,
    fetch: createDaemonFetch(baseUrl, auth),
  })
  return {
    subscribe: async (handler) => {
      const ctrl = new AbortController()
      const events = await client.global.event({ signal: ctrl.signal, sseMaxRetryAttempts: 0 }).catch(() => undefined)
      if (!events) {
        return () => {}
      }
      ;(async () => {
        try {
          for await (const event of events.stream) {
            if (ctrl.signal.aborted) break
            handler(event as GlobalEvent)
          }
        } catch {
          // daemon may be gone; unsubscribe is the user's escape hatch
        }
      })()
      return () => ctrl.abort()
    },
  }
}

function toWebSocketUrl(baseUrl: string) {
  return baseUrl.replace(/^http/, "ws")
}

export function createWebSocketEventSource(baseUrl: string, auth: string | undefined): EventSource {
  return {
    subscribe: async (handler) => {
      let wsUrl = `${toWebSocketUrl(baseUrl)}/global/ws`
      const intervalMs = heartbeatIntervalMs()
      let active = true
      let socket: WebSocket | undefined
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined
      let attempt = 0
      let lastKnownPort: number | undefined

      const send = (message: WsMessage) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(encodeWsMessage(message))
        }
      }

      const handleMessage = async (data: WebSocket.RawData) => {
        const decoded = await Effect.runPromise(
          decodeWsMessage(data.toString()).pipe(Effect.orElseSucceed(() => undefined)),
        )
        if (!decoded) return
        if (decoded.type === "ping") {
          send(wsPong())
          return
        }
        if (decoded.type === "event" && decoded.payload !== undefined) {
          handler(decoded.payload as GlobalEvent)
        }
      }

      const connect = (): Promise<WebSocket> =>
        new Promise((resolve, reject) => {
          if (!active) {
            reject(new Error("WebSocket event source unsubscribed"))
            return
          }

          const headers: Record<string, string> = {}
          if (auth) headers.Authorization = auth

          const ws = new WebSocket(wsUrl, { headers })
          ws.on("error", () => {})
          socket = ws

          const cleanup = () => {
            ws.off("open", onOpen)
            ws.off("error", onError)
            ws.off("close", onClose)
          }

          function onOpen() {
            cleanup()
            resolve(ws)
          }

          function onError(error: Error) {
            cleanup()
            ws.terminate()
            reject(error)
          }

          function onClose(code: number, reason: Buffer) {
            cleanup()
            reject(new Error(closeMessage("WebSocket closed before open", code, reason)))
          }

          ws.once("open", onOpen)
          ws.once("error", onError)
          ws.once("close", onClose)
        })

      const clearHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = undefined
        }
      }

      const startHeartbeat = (ws: WebSocket) => {
        if (intervalMs === 0) return
        clearHeartbeat()
        heartbeatTimer = setInterval(() => send(wsPing()), intervalMs)
      }

      const attach = (ws: WebSocket) => {
        attempt = 0
        ws.on("error", () => {})
        ws.on("message", handleMessage)
        ws.once("close", () => {
          ws.removeAllListeners()
          clearHeartbeat()
          scheduleReconnect()
        })
        ws.once("error", () => {
          ws.removeAllListeners()
          clearHeartbeat()
          scheduleReconnect()
        })
        startHeartbeat(ws)
      }

      const rediscoverDaemonUrl = async (): Promise<string | undefined> => {
        const portOpt = await Effect.runPromise(readDaemonPort())
        if (Option.isNone(portOpt)) return undefined
        const info: DaemonPort = portOpt.value
        if (info.port === lastKnownPort) return undefined
        const alive = await Effect.runPromise(isDaemonAlive(info))
        if (alive !== "alive") return undefined
        lastKnownPort = info.port
        return `${toWebSocketUrl(`http://127.0.0.1:${info.port}`)}/global/ws`
      }

      const scheduleReconnect = () => {
        if (!active || reconnectTimer) return
        attempt += 1
        const delay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
        reconnectTimer = setTimeout(async () => {
          reconnectTimer = undefined
          const rediscovered = await rediscoverDaemonUrl()
          if (rediscovered) wsUrl = rediscovered
          connect()
            .then(attach)
            .catch(() => scheduleReconnect())
        }, delay)
      }

      try {
        attach(await connect())
      } catch (error) {
        active = false
        socket = undefined
        throw error
      }

      return () => {
        active = false
        clearHeartbeat()
        if (reconnectTimer) clearTimeout(reconnectTimer)
        socket?.close()
        socket = undefined
      }
    },
  }
}

export function createHybridEventSource(baseUrl: string, auth: string | undefined): EventSource {
  const mode = process.env.OPENCODE_DAEMON_EVENTS ?? "auto"
  if (mode === "sse") return createSSEEventSource(baseUrl, auth)
  if (mode === "ws") return createWebSocketEventSource(baseUrl, auth)
  if (mode !== "auto") {
    console.warn(`unknown OPENCODE_DAEMON_EVENTS=${mode}, using auto`)
  }
  return {
    subscribe: async (handler) => {
      try {
        return await createWebSocketEventSource(baseUrl, auth).subscribe(handler)
      } catch {
        return createSSEEventSource(baseUrl, auth).subscribe(handler)
      }
    },
  }
}

function closeMessage(message: string, code: number, reason: Buffer) {
  const details = [`code ${code}`]
  if (reason.length > 0) details.push(reason.toString())
  return `${message} (${details.join(": ")})`
}

export * as DaemonTransport from "./daemon-transport"
