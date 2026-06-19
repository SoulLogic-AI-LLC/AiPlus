import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect, test } from "bun:test"
import { Context, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import WebSocket from "ws"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { GlobalBus } from "../../src/bus/global"
import { Installation } from "../../src/installation"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { ServerAuth } from "../../src/server/auth"
import { RootHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { controlHandlers } from "../../src/server/routes/instance/httpapi/handlers/control"
import { controlPlaneHandlers } from "../../src/server/routes/instance/httpapi/handlers/control-plane"
import { globalHandlers } from "../../src/server/routes/instance/httpapi/handlers/global"
import {
  decodeWsMessage,
  encodeWsMessage,
  wsPing,
  type WsMessage,
} from "../../src/server/routes/instance/httpapi/handlers/global-ws"
import { authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "../../src/server/routes/instance/httpapi/middleware/schema-error"

const apiLayer = HttpRouter.serve(
  HttpApiBuilder.layer(RootHttpApi).pipe(
    Layer.provide([controlHandlers, controlPlaneHandlers, globalHandlers]),
    Layer.provide([authorizationLayer, schemaErrorLayer]),
    // Raw HttpApi routes expose an opaque handler context at the request boundary.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    HttpRouter.provideRequest(Layer.succeedContext(Context.empty() as Context.Context<unknown>)),
  ),
  { disableListenLog: true, disableLogger: true },
).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(Layer.mock(Auth.Service)({})),
  Layer.provide(Layer.mock(Config.Service)({})),
  Layer.provide(Layer.mock(MoveSession.Service)({})),
  Layer.provide(
    Layer.mock(Installation.Service)({
      method: () => Effect.succeed("npm"),
      latest: () => Effect.succeed("9.9.9"),
      upgrade: () => Effect.void,
    }),
  ),
  Layer.provide(ServerAuth.Config.layer({ password: Option.none(), username: "opencode" })),
)

const serverUrl = HttpServer.HttpServer.use((server) => Effect.succeed(HttpServer.formatAddress(server.address)))

function openWebSocket(url: string): Effect.Effect<WebSocket> {
  return Effect.promise(
    () =>
      new Promise((resolve, reject) => {
        const wsUrl = url.replace(/^http/, "ws") + "/global/ws"
        const socket = new WebSocket(wsUrl)
        socket.once("open", () => {
          socket.removeAllListeners("error")
          resolve(socket)
        })
        socket.once("error", reject)
      }),
  )
}

function nextMessage(socket: WebSocket): Effect.Effect<WsMessage> {
  return Effect.callback<WsMessage>((resume) => {
    const onMessage = async (data: WebSocket.RawData) => {
      const decoded = await Effect.runPromise(
        decodeWsMessage(data.toString()).pipe(Effect.orElseSucceed(() => undefined)),
      )
      if (decoded === undefined) return
      cleanup()
      resume(Effect.succeed(decoded))
    }

    const cleanup = () => socket.off("message", onMessage)
    socket.on("message", onMessage)
    return Effect.sync(cleanup)
  })
}

function send(socket: WebSocket, message: WsMessage): Effect.Effect<void> {
  return Effect.sync(() => socket.send(encodeWsMessage(message)))
}

describe("daemon WebSocket events", () => {
  test(
    "receives server.connected, answers ping/pong, and forwards GlobalBus events",
    () =>
      Effect.gen(function* () {
        const url = yield* serverUrl
        const socket = yield* openWebSocket(url)

        const connected = yield* nextMessage(socket).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.fail(new Error("timed out waiting for server.connected")),
          }),
        )
        expect(connected.type).toBe("event")
        expect((connected.payload as { payload: { type: string } }).payload.type).toBe("server.connected")

        yield* send(socket, wsPing())
        const pong = yield* nextMessage(socket).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.fail(new Error("timed out waiting for pong")),
          }),
        )
        expect(pong.type).toBe("pong")

        GlobalBus.emit("event", {
          directory: "test",
          payload: { id: "evt-test", type: "plugin.added", properties: { id: "p1" } },
        })

        const busEvent = yield* nextMessage(socket).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.fail(new Error("timed out waiting for GlobalBus event")),
          }),
        )
        expect(busEvent.type).toBe("event")
        expect((busEvent.payload as { directory: string }).directory).toBe("test")
        expect((busEvent.payload as { payload: { type: string } }).payload.type).toBe("plugin.added")

        socket.close()
      }).pipe(Effect.provide(apiLayer), Effect.runPromise),
    { timeout: 15000 },
  )
})
