export * as SessionV2 from "./session"
export * from "./session/schema"

import { Cause, DateTime, Effect, Layer, Schema, Context, Stream } from "effect"
import { and, asc, desc, eq, gt, like, lt, or, type SQL } from "drizzle-orm"
import { ProjectV2 } from "./project"
import { WorkspaceV2 } from "./workspace"
import { ModelV2 } from "./model"
import { Location } from "./location"
import { SessionMessage } from "./session/message"
import { Prompt } from "./session/prompt"
import { EventV2 } from "./event"
import { Database } from "./database/database"
import { SessionProjector } from "./session/projector"
import { SessionMessageTable, SessionTable } from "./session/sql"
import { SessionSchema } from "./session/schema"
import { AbsolutePath, PositiveInt, RelativePath } from "./schema"
import { AgentV2 } from "./agent"
import { SessionV1 } from "./v1/session"
import { InstallationVersion } from "./installation/version"
import { Slug } from "./util/slug"
import { ProjectTable } from "./project/sql"
import path from "path"
import { fromRow } from "./session/info"
import { SessionRunner } from "./session/runner/index"
import { SessionStore } from "./session/store"
import { SessionExecution } from "./session/execution"
import { logFailure } from "./session/logging"
import { MessageDecodeError } from "./session/error"
import { SessionEvent } from "./session/event"
import { applyRedaction } from "../../../aiplus/memory/redact"
import { SessionInput } from "./session/input"
import * as fs from "node:fs"
import { checkPressure, initSessionCompactState } from "../../../aiplus/compact/monitor"
import { writeCapsule } from "../../../aiplus/compact/capsule"
import { appendMemoryEntry } from "../../../aiplus/memory/append"
import { verify as auditVerify } from "../../../aiplus/audit/runner"
import { verifyAndFix } from "../../../aiplus/managed-blocks/verifier"
import { interceptToolCall } from "../../../aiplus/effects/gateway"

// C.1 Multi-Lane: detect CEO lane from environment or agent name.
// AIPLUS_CEO_LANE env takes priority (ceo-1, ceo-2, ceo-3).
// Falls back to agent name (e.g., "ceo" → "ceo").
function detectLane(agentName: string): string {
  const envLane = process.env.AIPLUS_CEO_LANE
  if (envLane && /^(ceo-[123]|default)$/.test(envLane)) {
    return envLane
  }
  return agentName.replace(/^aiplus-/, "").toLowerCase() || "default"
}

// AiPlus compact handoff: check context pressure on session create/resume.
// GAP-6: tokensUsed is 0 on create (empty session); populated from session info on resume.
function checkCompactPressure(entry: {
  sessionId: string
  model?: { id: string; providerID: string; variant?: string }
  worktreePath: string
  tokensUsed?: number // GAP-6: from session info on resume (input+output tokens)
  role?: string
}) {
  try {
    const modelId = entry.model?.id ?? "unknown"
    const used = entry.tokensUsed ?? 0
    const result = checkPressure(entry.worktreePath, entry.sessionId, {
      used,
      total: 200_000,
      model: modelId,
    }, entry.role)
    writeCapsule(entry.worktreePath, result)
  } catch (err) {
    process.stderr.write(`[aiplus-compact] ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

// AiPlus worktree lease: fire-and-forget acquire on session create.
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// GC handles release (24h expiry + doctor/lobby cleanup).
async function acquireWorktreeLease(entry: { sessionId: string; lane: string; worktreePath: string }) {
  try {
    const leaseFile = `${entry.worktreePath}/.aiplus/worktree/leases.json`
    const dir = leaseFile.slice(0, leaseFile.lastIndexOf("/"))
    fs.mkdirSync(dir, { recursive: true })

    let state = { leases: [] as { leaseId: string; sessionId: string; worktreePath: string; lane: string; status: string; acquiredAt: string; expiresAt: string; baseCommit: string }[] }
    if (fs.existsSync(leaseFile)) {
      try { state = JSON.parse(fs.readFileSync(leaseFile, "utf-8")) } catch { /* reset on corruption */ }
    }

    // Fencing: reject if same lane has active lease
    const expired = state.leases.filter(l => l.expiresAt && Date.now() - new Date(l.expiresAt).getTime() > 24 * 60 * 60 * 1000)
    const active = state.leases.filter(l => l.status === "active" && !expired.includes(l))
    if (active.some(l => l.lane === entry.lane)) return // lane busy, skip

    state.leases = state.leases.filter(l => !expired.includes(l))
    state.leases.push({
      leaseId: `lease-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: entry.sessionId,
      worktreePath: entry.worktreePath,
      lane: entry.lane,
      status: "active",
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      baseCommit: "unknown",
    })

    // Write state with lockfile to prevent concurrent corruption.
    // Atomic: write to .tmp, then rename (same-filesystem atomic).
    const tmpFile = leaseFile + ".tmp"
    const lockFile = leaseFile + ".lock"
    // Wait for lock (spin, max 500ms)
    for (let i = 0; i < 10; i++) {
      try { fs.writeFileSync(lockFile, "", { flag: "wx" }); break }
      catch { if (i === 9) throw new Error("worktree lease lock timeout"); await wait(50) }
    }
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf-8")
      fs.renameSync(tmpFile, leaseFile)
    } finally {
      try { fs.unlinkSync(lockFile) } catch { /* best-effort */ }
    }
  } catch (err) {
    process.stderr.write(`[aiplus-worktree] ${err instanceof Error ? err.message : String(err)}\n`)
  }
}
export function appendDispatchLog(entry: {
  dispatchId: string
  role: string
  sessionId: string
  task: string
  worktreePath: string
}) {
  try {
    const logDir = `${entry.worktreePath}/.aiplus/agents`
    const logFile = `${logDir}/dispatch-log.jsonl`
    fs.mkdirSync(logDir, { recursive: true })

    // GAP-1: idempotencyKey = SHA-256(dispatchId + sessionId + timestamp)[0:8]
    const now = new Date().toISOString()
    const rawKey = `${entry.dispatchId}:${entry.sessionId}:${now}`
    const idempotencyKey = Bun.SHA256.hash(rawKey, "hex").slice(0, 8)

    // GAP-2: hash chain — read last entry_hash, compute new
    let prevHash = "genesis"
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(l => l.trim())
      if (lines.length > 0) {
        try { prevHash = JSON.parse(lines[lines.length - 1]).entry_hash ?? "genesis" }
        catch { /* corrupt line, treat as genesis */ }
      }
    }
    const entryBody = JSON.stringify({
      ...entry,
      idempotencyKey,
      status: "created",
      timestamp: now,
    })
    const entryHash = Bun.SHA256.hash(entryBody, "hex").slice(0, 16)

    const line = JSON.stringify({
      ...entry,
      idempotencyKey,
      prev_hash: prevHash,
      entry_hash: entryHash,
      status: "created",
      timestamp: now,
    }) + "\n"
    fs.appendFileSync(logFile, applyRedaction(line), "utf-8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[aiplus-dispatch] ${msg}\n`)
  }
}

// get project -> project.locations
//
// get all sessions
//

// - by project
//   - by subpath
// - by workspace (home is special)

export const ListAnchor = Schema.Struct({
  id: SessionSchema.ID,
  time: Schema.Finite,
  direction: Schema.Literals(["previous", "next"]),
})
export type ListAnchor = typeof ListAnchor.Type

const ListInputBase = {
  workspaceID: WorkspaceV2.ID.pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
  limit: PositiveInt.pipe(Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  anchor: ListAnchor.pipe(Schema.optional),
}

const ListDirectoryInput = Schema.Struct({
  ...ListInputBase,
  directory: AbsolutePath,
})

const ListProjectInput = Schema.Struct({
  ...ListInputBase,
  project: ProjectV2.ID,
  subpath: RelativePath.pipe(Schema.optional),
})

const ListAllInput = Schema.Struct(ListInputBase)

export const ListInput = Schema.Union([ListDirectoryInput, ListProjectInput, ListAllInput])
export type ListInput = typeof ListInput.Type

type CreateInput = {
  id?: SessionSchema.ID
  agent?: AgentV2.ID
  model?: ModelV2.Ref
  location: Location.Ref
}

type CompactInput = {
  sessionID: SessionSchema.ID
  prompt?: Prompt
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Session.NotFoundError", {
  sessionID: SessionSchema.ID,
}) {}

export class OperationUnavailableError extends Schema.TaggedErrorClass<OperationUnavailableError>()(
  "Session.OperationUnavailableError",
  {
    operation: Schema.Literals(["move", "shell", "skill", "switchAgent", "compact", "wait"]),
  },
) {}

export { ContextSnapshotDecodeError, MessageDecodeError } from "./session/error"

export class PromptConflictError extends Schema.TaggedErrorClass<PromptConflictError>()("Session.PromptConflictError", {
  sessionID: SessionSchema.ID,
  messageID: SessionMessage.ID,
}) {}

export type Error = NotFoundError | MessageDecodeError | OperationUnavailableError | PromptConflictError

export interface Interface {
  readonly list: (input?: ListInput) => Effect.Effect<SessionSchema.Info[]>
  readonly create: (input: CreateInput) => Effect.Effect<SessionSchema.Info>
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info, NotFoundError>
  readonly messages: (input: {
    sessionID: SessionSchema.ID
    limit?: number
    order?: "asc" | "desc"
    cursor?: {
      id: SessionMessage.ID
      direction: "previous" | "next"
    }
  }) => Effect.Effect<SessionMessage.Message[], NotFoundError | MessageDecodeError>
  readonly message: (input: {
    sessionID: SessionSchema.ID
    messageID: SessionMessage.ID
  }) => Effect.Effect<SessionMessage.Message | undefined>
  readonly context: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<SessionMessage.Message[], NotFoundError | MessageDecodeError>
  readonly events: (input: {
    sessionID: SessionSchema.ID
    after?: EventV2.Cursor
  }) => Stream.Stream<EventV2.CursorEvent<SessionEvent.DurableEvent>, NotFoundError>
  readonly switchAgent: (input: {
    sessionID: SessionSchema.ID
    agent: string
  }) => Effect.Effect<void, OperationUnavailableError>
  readonly switchModel: (input: {
    sessionID: SessionSchema.ID
    model: ModelV2.Ref
  }) => Effect.Effect<void, NotFoundError>
  readonly prompt: (input: {
    id?: SessionMessage.ID
    sessionID: SessionSchema.ID
    prompt: Prompt
    delivery?: SessionInput.Delivery
    resume?: boolean
  }) => Effect.Effect<SessionInput.Admitted, NotFoundError | PromptConflictError>
  readonly shell: (input: {
    id?: EventV2.ID
    sessionID: SessionSchema.ID
    command: string
    resume?: boolean
  }) => Effect.Effect<void, OperationUnavailableError>
  readonly skill: (input: {
    id?: EventV2.ID
    sessionID: SessionSchema.ID
    skill: string
    resume?: boolean
  }) => Effect.Effect<void, OperationUnavailableError>
  readonly compact: (input: CompactInput) => Effect.Effect<void, NotFoundError | OperationUnavailableError>
  readonly wait: (id: SessionSchema.ID) => Effect.Effect<void, NotFoundError | OperationUnavailableError>
  readonly resume: (sessionID: SessionSchema.ID) => Effect.Effect<void, NotFoundError | SessionRunner.RunError>
  readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Session") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
    const isDurableSessionEvent = Schema.is(SessionEvent.Durable)
    const scope = yield* Effect.scope

    const enqueueWake = (admitted: SessionInput.Admitted) =>
      execution.wake(admitted.sessionID, admitted.admittedSeq).pipe(
        Effect.tapCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : logFailure("Failed to wake Session", admitted.sessionID, cause),
        ),
        Effect.ignore,
        Effect.forkIn(scope, { startImmediately: true }),
        Effect.asVoid,
      )

    const decode = (row: typeof SessionMessageTable.$inferSelect) =>
      decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
        Effect.mapError(
          () =>
            new MessageDecodeError({
              sessionID: SessionSchema.ID.make(row.session_id),
              messageID: SessionMessage.ID.make(row.id),
            }),
        ),
      )

    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        // GAP-6: compact pressure check on resume (recorded session has real token usage)
        if (recorded) {
          void checkCompactPressure({
            sessionId: sessionID,
            model: input.model,
            worktreePath: input.location.directory,
            tokensUsed: (recorded.tokens?.input ?? 0) + (recorded.tokens?.output ?? 0),
            role: input.agent,
          })
          return recorded
        }
        const project = yield* projects.resolve(input.location.directory)
        yield* db
          .insert(ProjectTable)
          .values({ id: project.id, worktree: project.directory, vcs: project.vcs?.type, sandboxes: [] })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)
        const now = Date.now()
        const info = SessionV1.SessionInfo.make({
          id: sessionID,
          slug: Slug.create(),
          version: InstallationVersion,
          projectID: project.id,
          directory: input.location.directory,
          path: path.relative(project.directory, input.location.directory).replaceAll("\\", "/"),
          workspaceID: input.location.workspaceID ? WorkspaceV2.ID.make(input.location.workspaceID) : undefined,
          title: `New session - ${new Date(now).toISOString()}`,
          agent: input.agent,
          model: input.model
            ? {
                id: ModelV2.ID.make(input.model.id),
                providerID: input.model.providerID,
                variant: input.model.variant,
              }
            : undefined,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: now, updated: now },
        })
        const projected = yield* events
          .publish(SessionV1.Event.Created, { sessionID, info }, { location: input.location })
          .pipe(
            Effect.as({ type: "created" } as const),
            Effect.catchDefect((defect) => {
              if (!(defect instanceof SessionProjector.SessionAlreadyProjected)) {
                return Effect.die(defect)
              }
              // Concurrent creation lost the projection race. The existing Session identity wins.
              return store
                .get(sessionID)
                .pipe(
                  Effect.flatMap((session) =>
                    session ? Effect.succeed({ type: "existing", session } as const) : Effect.die(defect),
                  ),
                )
            }),
          )
        if (projected.type === "existing") return projected.session
        // AiPlus dispatch log: fire-and-forget append on session creation.
        void appendDispatchLog({
          dispatchId: `dispatch-${sessionID}`,
          role: (input.agent ?? "unknown").replace(/^aiplus-/, "").toLowerCase(),
          lane: detectLane(input.agent ?? "default"),
          task: input.agent ? `[${input.agent}] session created` : "(session-create)",
          sessionId: sessionID,
          worktreePath: input.location.directory,
        })
        // AiPlus worktree lease: acquire on session create.
        // Release is handled by GC (24h expiry) — OpenCode has no explicit session.destroy().
        void acquireWorktreeLease({
          sessionId: sessionID,
          lane: detectLane(input.agent ?? "default"),
          worktreePath: input.location.directory,
        })
        // AiPlus compact handoff: check context pressure on session create.
        // At create time, token usage is 0 → pressure is SILENT for new sessions.
        // Full pressure tracking needs session resume hooks (future PR).
        void checkCompactPressure({
          sessionId: sessionID,
          model: input.model,
          worktreePath: input.location.directory,
          role: input.agent,
        })
        // AiPlus audit: run project-level integrity checks on session create.
        // Covers D1 (dispatch chain), D2 (memory match), D3 (persona permissions).
        void auditVerify(input.location.directory, sessionID)
        // AiPlus managed blocks: auto-fix missing blocks in markdown body.
        // YAML frontmatter is WARN-only (never auto-modified).
        // Fire-and-forget — a single managed-block failure must not crash session create.
        try {
          void verifyAndFix(input.location.directory)
        } catch (err) {
          console.error("[aiplus] managed-blocks verifyAndFix failed:", err)
        }
        // TODO: Restore recorded sessions onto replacement synchronized workspaces in a future API slice.
        return yield* result.get(sessionID).pipe(Effect.orDie)
      }),
      get: Effect.fn("V2Session.get")(function* (sessionID) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* new NotFoundError({ sessionID })
        return session
      }),
      list: Effect.fn("V2Session.list")(function* (input = {}) {
        const direction = input.anchor?.direction ?? "next"
        const requestedOrder = input.order ?? "desc"
        const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
        const sortColumn = SessionTable.time_created
        const conditions: SQL[] = []
        if ("directory" in input) conditions.push(eq(SessionTable.directory, input.directory))
        if (input.workspaceID) conditions.push(eq(SessionTable.workspace_id, input.workspaceID))
        if ("project" in input) conditions.push(eq(SessionTable.project_id, input.project))
        if (input.search) conditions.push(like(SessionTable.title, `%${input.search}%`))
        if (input.anchor) {
          conditions.push(
            order === "asc"
              ? or(
                  gt(sortColumn, input.anchor.time),
                  and(eq(sortColumn, input.anchor.time), gt(SessionTable.id, input.anchor.id)),
                )!
              : or(
                  lt(sortColumn, input.anchor.time),
                  and(eq(sortColumn, input.anchor.time), lt(SessionTable.id, input.anchor.id)),
                )!,
          )
        }
        const query = db
          .select()
          .from(SessionTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            order === "asc" ? asc(sortColumn) : desc(sortColumn),
            order === "asc" ? asc(SessionTable.id) : desc(SessionTable.id),
          )
        const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
          Effect.orDie,
        )
        return (direction === "previous" ? rows.toReversed() : rows).map((row) => fromRow(row))
      }),
      messages: Effect.fn("V2Session.messages")(function* (input) {
        yield* result.get(input.sessionID)
        const direction = input.cursor?.direction ?? "next"
        const requestedOrder = input.order ?? "desc"
        const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
        const anchor = input.cursor
          ? yield* db
              .select({ seq: SessionMessageTable.seq })
              .from(SessionMessageTable)
              .where(
                and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.cursor.id)),
              )
              .get()
              .pipe(Effect.orDie)
          : undefined
        if (input.cursor && !anchor) return []
        const boundary = anchor
          ? order === "asc"
            ? gt(SessionMessageTable.seq, anchor.seq)
            : lt(SessionMessageTable.seq, anchor.seq)
          : undefined
        const where = boundary
          ? and(eq(SessionMessageTable.session_id, input.sessionID), boundary)
          : eq(SessionMessageTable.session_id, input.sessionID)
        const query = db
          .select()
          .from(SessionMessageTable)
          .where(where)
          .orderBy(order === "asc" ? asc(SessionMessageTable.seq) : desc(SessionMessageTable.seq))
        const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
          Effect.orDie,
        )
        return yield* Effect.forEach(direction === "previous" ? rows.toReversed() : rows, decode)
      }),
      message: Effect.fn("V2Session.message")(function* (input) {
        const stored = yield* store.message(input.messageID)
        return stored?.sessionID === input.sessionID ? stored.message : undefined
      }),
      context: Effect.fn("V2Session.context")(function* (sessionID) {
        yield* result.get(sessionID)
        return yield* store.context(sessionID)
      }),
      events: (input) =>
        Stream.unwrap(
          result
            .get(input.sessionID)
            .pipe(Effect.as(events.aggregateEvents({ aggregateID: input.sessionID, after: input.after }))),
        ).pipe(
          Stream.filter((event): event is EventV2.CursorEvent<SessionEvent.DurableEvent> =>
            isDurableSessionEvent(event.event),
          ),
        ),
      prompt: Effect.fn("V2Session.prompt")((input) =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            yield* result.get(input.sessionID)
            const returnPrompt = Effect.fnUntraced(function* (admitted: SessionInput.Admitted) {
              if (input.resume !== false) yield* enqueueWake(admitted)
              return admitted
            }, Effect.uninterruptible)
            const messageID = input.id ?? SessionMessage.ID.create()
            const delivery = input.delivery ?? "steer"
            const expected = { sessionID: input.sessionID, messageID, prompt: input.prompt, delivery }
            const admitted = yield* SessionInput.admit(db, events, {
              id: messageID,
              sessionID: input.sessionID,
              prompt: input.prompt,
              delivery,
            }).pipe(
              Effect.catchDefect((defect) =>
                defect instanceof SessionInput.LifecycleConflict
                  ? new PromptConflictError({ sessionID: input.sessionID, messageID })
                  : Effect.die(defect),
              ),
            )
            if (!SessionInput.equivalent(admitted, expected))
              return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
            return yield* returnPrompt(admitted)
          }),
        ),
      ),
      shell: Effect.fn("V2Session.shell")(function* () {
        return yield* new OperationUnavailableError({ operation: "shell" })
      }),
      skill: Effect.fn("V2Session.skill")(function* () {
        return yield* new OperationUnavailableError({ operation: "skill" })
      }),
      switchAgent: Effect.fn("V2Session.switchAgent")(function* () {
        return yield* new OperationUnavailableError({ operation: "switchAgent" })
      }),
      switchModel: Effect.fn("V2Session.switchModel")(function* (input) {
        yield* result.get(input.sessionID)
        yield* events.publish(SessionEvent.ModelSwitched, {
          sessionID: input.sessionID,
          messageID: SessionMessage.ID.create(),
          timestamp: yield* DateTime.now,
          model: input.model,
        })
      }),
      compact: Effect.fn("V2Session.compact")(function* (input) {
        const session = yield* result.get(input.sessionID)
        // TODO: implement actual compact logic (V2 gate — current stub always errors).
        // Post-compact hooks (bump generation, force-fresh check, memory append)
        // must only execute after successful compaction — do not bump before stub returns error.
        return yield* new OperationUnavailableError({ operation: "compact" })
      }),
      wait: Effect.fn("V2Session.wait")(function* (sessionID) {
        yield* result.get(sessionID)
        return yield* new OperationUnavailableError({ operation: "wait" })
      }),
      resume: Effect.fn("V2Session.resume")(function* (sessionID) {
        yield* result.get(sessionID)
        yield* execution.resume(sessionID)
      }),
      interrupt: Effect.fn("V2Session.interrupt")((sessionID) =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            const session = yield* store.get(sessionID)
            if (!session) return yield* execution.interrupt(sessionID)
            const event = yield* events.publish(SessionEvent.InterruptRequested, {
              sessionID,
              timestamp: yield* DateTime.now,
            })
            if (event.seq === undefined)
              return yield* Effect.die("Interrupt request event is missing aggregate sequence")
            yield* execution.interrupt(sessionID, event.seq)
            // AiPlus memory hook: record session end on interrupt.
            void appendMemoryEntry({
              projectRoot: session.directory,
              sessionId: sessionID,
              role: (session.agent ?? "unknown").replace(/^aiplus-/, "").toLowerCase(),
              startedAt: new Date(session.time.created).toISOString(),
              endedAt: new Date().toISOString(),
              task: session.title ?? "(interrupt)",
              outcome: "canceled",
            })
          }),
        ),
      ),
    })

    return result
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(SessionExecution.noopLayer),
  Layer.provide(SessionStore.defaultLayer),
  Layer.provide(SessionProjector.defaultLayer),
  Layer.provide(EventV2.defaultLayer),
  Layer.provide(Database.defaultLayer),
  Layer.provide(ProjectV2.defaultLayer),
  Layer.orDie,
)
