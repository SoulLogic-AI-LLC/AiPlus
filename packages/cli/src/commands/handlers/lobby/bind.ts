import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { bindCommand } from "../../../../../../aiplus/lobby/index"

export default Runtime.handler(Commands.commands.lobby.commands.bind, (input) =>
  Effect.gen(function* () {
    const role = input.role?._tag === "Some" ? input.role.value : null
    yield* Effect.log(bindCommand(process.cwd(), role))
  }),
)
