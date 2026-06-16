import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import type { EventSource } from "@opencode-ai/tui/context/sdk"
import { Effect } from "effect"
import WebSocket from "ws"
import {
  decodeWsMessage,
  encodeWsMessage,
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

export function createDaemonFetch(url: string, auth: string | undefined) {
  const fn = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    if (auth && !headers.has("authorization") && !headers.has("Authorization")) {
      headers.set("Authorization", auth)
    }
    return globalThis.fetch(
      typeof input === "string" && !input.startsWith("http") ? `${url}${input}` : input,
      { ...init, headers },
    )
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
      const events = await client.global
        .event({ signal: ctrl.signal, sseMaxRetryAttempts: 0 })
        .catch(() => undefined)
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
      const wsUrl = `${toWebSocketUrl(baseUrl)}/global/ws`
      let active = true
      let socket: WebSocket | undefined
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let attempt = 0

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

      const attach = (ws: WebSocket) => {
        attempt = 0
        ws.on("error", () => {})
        ws.on("message", handleMessage)
        ws.once("close", () => {
          ws.removeAllListeners()
          scheduleReconnect()
        })
        ws.once("error", () => {
          ws.removeAllListeners()
          scheduleReconnect()
        })
      }

      const scheduleReconnect = () => {
        if (!active || reconnectTimer) return
        attempt += 1
        const delay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connect().then(attach).catch(() => scheduleReconnect())
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
