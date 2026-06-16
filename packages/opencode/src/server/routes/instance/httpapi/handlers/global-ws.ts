import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { DaemonLifecycle } from "@/cli/daemon-lifecycle"
import { EventV2 } from "@opencode-ai/core/event"
import { Effect, Option, Queue, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { WebSocketTracker } from "../websocket-tracker"

export const WsMessageType = Schema.Union([
  Schema.Literal("event"),
  Schema.Literal("request"),
  Schema.Literal("response"),
  Schema.Literal("error"),
  Schema.Literal("ping"),
  Schema.Literal("pong"),
])

export const WsMessage = Schema.Struct({
  type: WsMessageType,
  id: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.Unknown),
})
export type WsMessage = typeof WsMessage.Type

export const WsErrorPayload = Schema.Struct({
  code: Schema.Union([
    Schema.Literal("unauthorized"),
    Schema.Literal("invalid_message"),
    Schema.Literal("internal"),
    Schema.Literal("rate_limited"),
    Schema.Literal("closing"),
  ]),
  message: Schema.String,
})
export type WsErrorPayload = typeof WsErrorPayload.Type

export class WsDecodeError extends Schema.TaggedErrorClass<WsDecodeError>()(
  "WsDecodeError",
  {
    reason: Schema.Union([Schema.Literal("parse"), Schema.Literal("schema")]),
    cause: Schema.Defect,
  },
) {}

export const encodeWsMessage = (message: WsMessage): string => JSON.stringify(message)

export const decodeWsMessage = (raw: string): Effect.Effect<WsMessage, WsDecodeError> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw),
      catch: (e) => new WsDecodeError({ reason: "parse", cause: e }),
    })
    return yield* Schema.decodeUnknownEffect(WsMessage)(parsed).pipe(
      Effect.mapError((e) => new WsDecodeError({ reason: "schema", cause: e })),
    )
  })

export const wsEvent = (id: string | undefined, payload: unknown): WsMessage =>
  ({ type: "event", id, payload })

export const wsRequest = (id: string, payload: unknown): WsMessage =>
  ({ type: "request", id, payload })

export const wsResponse = (id: string, payload: unknown): WsMessage =>
  ({ type: "response", id, payload })

export const wsError = (id: string | undefined, payload: WsErrorPayload): WsMessage =>
  ({ type: "error", id, payload })

export const wsPing = (): WsMessage => ({ type: "ping" })
export const wsPong = (): WsMessage => ({ type: "pong" })

export const globalWebSocketHandler = Effect.fn("GlobalHttpApi.ws")(function* (ctx: {
  request: HttpServerRequest.HttpServerRequest
}) {
  const socket = yield* Effect.orDie(ctx.request.upgrade)
  const write = yield* socket.writer

  const registered = yield* WebSocketTracker.register(write(WebSocketTracker.SERVER_CLOSING_EVENT()))
  if (!registered) return HttpServerResponse.empty()

  const send = (message: WsMessage) =>
    write(encodeWsMessage(message)).pipe(Effect.catch(() => Effect.void))

  const events = Stream.callback<GlobalBusEvent>((queue) => {
    const handler = (event: GlobalBusEvent) => Queue.offerUnsafe(queue, event)
    return Effect.acquireRelease(
      Effect.sync(() => GlobalBus.on("event", handler)),
      () => Effect.sync(() => GlobalBus.off("event", handler)),
    )
  })

  yield* Effect.forkScoped(events.pipe(Stream.runForEach((event) => send(wsEvent(undefined, event)))))

  const onConnectionOpen = Effect.gen(function* () {
    yield* send(
      wsEvent(undefined, {
        payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} },
      }),
    )
    const lifecycle = yield* Effect.serviceOption(DaemonLifecycle.Service)
    if (Option.isSome(lifecycle)) yield* lifecycle.value.addConnection
  })

  const onConnectionClose = Effect.gen(function* () {
    yield* Effect.logInfo("global websocket disconnected")
    const lifecycle = yield* Effect.serviceOption(DaemonLifecycle.Service)
    if (Option.isSome(lifecycle)) yield* lifecycle.value.removeConnection
  })

  yield* socket
    .runString(
      (message) =>
        Effect.gen(function* () {
          const decoded = yield* decodeWsMessage(message)
          if (decoded.type === "ping") {
            yield* send(wsPong())
            return
          }
        }).pipe(
          Effect.catchTag("WsDecodeError", (error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(`Global WS invalid message: ${error.reason}`)
              yield* send(
                wsError(undefined, {
                  code: "invalid_message",
                  message: `Invalid message: ${error.reason}`,
                }),
              )
            }),
          ),
          Effect.catch(() => Effect.void),
        ),
      {
        onOpen: onConnectionOpen,
      },
    )
    .pipe(
      Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
      Effect.ensuring(onConnectionClose),
      Effect.orDie,
    )

  return HttpServerResponse.empty()
})
