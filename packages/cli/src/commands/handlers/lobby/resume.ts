import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { resumeCommand } from "../../../../../../aiplus/lobby/index"

export default Runtime.handler(Commands.commands.lobby.commands.resume, (input) =>
  Effect.gen(function* () {
    yield* Effect.log(resumeCommand(process.cwd(), input.sessionId))
  }),
)
