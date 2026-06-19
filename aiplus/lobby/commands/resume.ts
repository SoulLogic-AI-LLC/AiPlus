/**
 * Lobby CLI — Resume Command
 *
 * Shows session info and resume instructions.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { readDispatchLog, extractSessionId } from "../dispatch"
import { formatResumeInfo, formatError } from "../format"

/** Run lobby resume command. */
export function resumeCommand(projectRoot: string, sessionId: string): string {
  const entries = readDispatchLog(projectRoot)

  // Find session by dispatch ID or session ID
  const entry = entries.find((e) => {
    const extractedId = extractSessionId(e.dispatchId)
    return e.dispatchId === sessionId || extractedId === sessionId
  })

  if (!entry) {
    return formatError(`Session not found: ${sessionId}`)
  }

  const extractedSessionId = extractSessionId(entry.dispatchId)
  const task = (entry.task as string) ?? "(no task)"

  return formatResumeInfo(extractedSessionId, entry.role, task)
}
