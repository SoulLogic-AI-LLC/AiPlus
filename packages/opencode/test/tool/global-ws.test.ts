import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  decodeWsMessage,
  encodeWsMessage,
  wsError,
  wsEvent,
  wsPing,
  wsPong,
  wsRequest,
  wsResponse,
  type WsErrorPayload,
  type WsMessage,
} from "../../src/server/routes/instance/httpapi/handlers/global-ws"

const decodeReason = (raw: string): Promise<string> =>
  decodeWsMessage(raw).pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
    Effect.runPromise,
  )

describe("global-ws protocol", () => {
  test("encodeWsMessage(wsPing()) returns compact JSON", () => {
    expect(encodeWsMessage(wsPing())).toBe('{"type":"ping"}')
  })

  test("decodeWsMessage parses a valid event message", async () => {
    const raw = '{"type":"event","id":"x","payload":{"foo":1}}'
    const message = await Effect.runPromise(decodeWsMessage(raw))
    expect(message.type).toBe("event")
    expect(message.id).toBe("x")
    expect(message.payload).toEqual({ foo: 1 })
  })

  test("decodeWsMessage fails with reason parse for invalid JSON", async () => {
    const reason = await decodeReason("not json")
    expect(reason).toBe("parse")
  })

  test("decodeWsMessage fails with reason schema for unknown type", async () => {
    const reason = await decodeReason('{"type":"unknown"}')
    expect(reason).toBe("schema")
  })

  test("convenience constructors produce expected shapes", () => {
    expect(wsEvent("e1", { a: 1 })).toEqual({ type: "event", id: "e1", payload: { a: 1 } })
    expect(wsRequest("r1", { action: "ping" })).toEqual({
      type: "request",
      id: "r1",
      payload: { action: "ping" },
    })
    expect(wsResponse("r1", { ok: true })).toEqual({ type: "response", id: "r1", payload: { ok: true } })
    const errorPayload: WsErrorPayload = { code: "internal", message: "oops" }
    expect(wsError("e1", errorPayload)).toEqual({ type: "error", id: "e1", payload: errorPayload })
    expect(wsPing()).toEqual({ type: "ping" })
    expect(wsPong()).toEqual({ type: "pong" })
  })
})
