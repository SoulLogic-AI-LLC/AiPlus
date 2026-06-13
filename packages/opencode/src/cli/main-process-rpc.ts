import { Rpc } from "@/util/rpc"
import type { rpc } from "./tui/worker"
import type { AiplusHookEvent } from "@/session/aiplus-hook-events"

export function createMainProcessRpcClient(worker: Worker) {
  const client = Rpc.client<typeof rpc>(worker)

  client.on<AiplusHookEvent>("aiplus.hook", (event) => {
    void import("./tui/aiplus-hooks")
      .then(({ handleAiplusHookEvent }) => {
        handleAiplusHookEvent(event)
      })
      .catch(() => {
        // fire-and-forget
      })
  })

  return client
}
