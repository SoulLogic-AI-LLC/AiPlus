import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import type { EventSource } from "@opencode-ai/tui/context/sdk"

/**
 * Daemon HTTP transport factories for the Phase 1 unified backend.
 *
 * Extracted from `cli/cmd/tui.ts` so the TUI handler diff stays small and
 * reviewable (B2 Reviewer enforces diff scope = handler). Promoting these
 * helpers to a sibling module also makes them reusable from any future
 * caller that needs to talk to a daemon over HTTP + SSE.
 *
 * The EventSource adapter reuses the opencode SDK's `createOpencodeClient` +
 * `client.global.event()` pair — the same SSE path the TUI SDK uses
 * internally at `tui/src/context/sdk.tsx:82-117`. By passing our own fetch
 * (auth-aware, base-URL-aware) into the SDK client, we get the SDK's
 * stream-parsing logic for free and just feed events to the TUI handler.
 */

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

export * as DaemonTransport from "./daemon-transport"
