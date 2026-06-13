/**
 * Lobby CLI — Command Handler
 *
 * Handles `opencode lobby status|bind|resume` commands.
 */

import * as Effect from "effect/Effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { statusCommand, bindCommand, resumeCommand } from "../../../aiplus/lobby/index"

export default Runtime.handler(Commands.commands.lobby, (input) =>
  Effect.gen(function* () {
    const projectRoot = process.cwd()

    // Handle subcommands
    if ("status" in input) {
      const output = statusCommand(projectRoot)
      yield* Effect.log(output)
      return
    }

    if ("bind" in input) {
      const role = (input as { role?: string }).role ?? null
      const output = bindCommand(projectRoot, role)
      yield* Effect.log(output)
      return
    }

    if ("resume" in input) {
      const sessionId = (input as { sessionId: string }).sessionId
      const output = resumeCommand(projectRoot, sessionId)
      yield* Effect.log(output)
      return
    }

    // Default: show status
    const output = statusCommand(projectRoot)
    yield* Effect.log(output)
  }),
)
