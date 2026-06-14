import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { statusCommand } from "../../../../../../aiplus/lobby/index"

export default Runtime.handler(Commands.commands.lobby.commands.status, (_input) =>
  Effect.gen(function* () {
    yield* Effect.log(statusCommand(process.cwd()))
  }),
)
