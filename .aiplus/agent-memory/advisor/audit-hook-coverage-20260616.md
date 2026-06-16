# AiPlus Audit Hook Coverage Verification — 2026-06-16

## Verdict

**FULLY COVERED**

All four session-creation paths the Owner listed reach `aiplusAudit` (defined at
`packages/core/src/session/projector.ts:128`, called at `packages/core/src/session/projector.ts:288`)
through the shared `SessionV1.Event.Created` event projection. The hook fires from the
EventV2 subscriber wired in `SessionProjector.layer` (`packages/core/src/session/projector.ts:260-291`),
which is composed into the runtime via `SessionV2.defaultLayer`
(`packages/core/src/session.ts:485-492`).

## Per-path coverage

### 1. CLI dispatch
- **Status**: PASS
- **Entry point**: `packages/opencode/src/cli/cmd/run.ts:485` (`createFreshSession` — invoked
  from the `runInteractiveMode` branch at `:826` and the `runInteractiveLocalMode` branch at `:853`)
- **Call chain**:
  `packages/opencode/src/cli/cmd/run.ts:485` (`createFreshSession`)
  → `packages/opencode/src/cli/cmd/run.ts:489` (`sdk.session.create(...)` — SDK call into the
  in-process opencode HTTP API via `Server.Default().app.fetch` at
  `packages/opencode/src/cli/cmd/run.ts:843` / `:878`)
  → `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:203` (declared
  endpoint `session.create`, path `/session`)
  → `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:153` (handler
  `create`) → `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:154`
  (`yield* shareSvc.create(ctx.payload)`)
  → `packages/opencode/src/share/session.ts:40` (`yield* session.create(input)`)
  → `packages/opencode/src/session/session.ts:709-731` (`Session.Service.create` → `createNext`)
  → `packages/opencode/src/session/session.ts:577` (`events.publish(SessionV1.Event.Created, { sessionID, info })`)
  → `packages/core/src/session/projector.ts:265-291` (projector handler subscribed via
  `events.project(SessionV1.Event.Created, ...)`)
  → `packages/core/src/session/projector.ts:288` (`aiplusAudit(info.directory, sid)`)
- **Evidence**:
  - `packages/opencode/src/cli/cmd/run.ts:485-511` — `createFreshSession` definition
  - `packages/opencode/src/cli/cmd/run.ts:826, :853` — `createSession: createFreshSession` injection into both interactive modes
  - `packages/opencode/src/share/session.ts:39-46` — `SessionShare.create` delegates to `Session.Service.create`
  - `packages/opencode/src/session/session.ts:709-731` — `Session.Service.create` → `createNext`
  - `packages/opencode/src/session/session.ts:538-580` — `createNext` builds `Info` and emits `SessionV1.Event.Created` at `:577`
- **Notes**:
  - The `createFreshSession` flow at `run.ts:454-457` (the earlier call site for `--title`
    mode) is the same path: `sdk.session.create()` → same HTTP handler → same projector hook.
  - The CLI's `--session`/`--continue`/`--fork` flags reuse an existing session and do NOT
    call `createFreshSession`; forking instead calls `Session.fork` at
    `packages/opencode/src/session/session.ts:733-774`, which internally calls `createNext`
    at `:737` and therefore still fires `SessionV1.Event.Created` at `:577` → hook fires.

### 2. TUI native
- **Status**: PASS
- **Entry point**: `packages/tui/src/component/prompt/index.tsx:994`
  (`sdk.client.session.create(...)` in the Solid.js prompt submit path; also reached from
  `packages/tui/src/component/prompt/index.tsx:929`'s comment which references the same call)
- **Call chain**:
  `packages/tui/src/component/prompt/index.tsx:994` (`await sdk.client.session.create({...})`)
  → HTTP `POST /session` (same `InstanceHttpApi` route at
  `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:203-214`)
  → `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:157-174`
  (`createRaw` → `create`)
  → `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:153-155`
  (`shareSvc.create(ctx.payload)`)
  → identical shared sequence from path #1: `SessionShare.create` → `Session.Service.create` →
  `createNext` → `events.publish(SessionV1.Event.Created, ...)` →
  `projector.ts:265-291` handler → `aiplusAudit` at `projector.ts:288`
- **Evidence**:
  - `packages/tui/src/component/prompt/index.tsx:994` — the TUI's first-prompt session creation call
  - `packages/tui/src/component/prompt/index.tsx:986-1003` — confirms the call is gated on `sessionID == null` (i.e. fresh session)
  - The TUI is launched by `opencode tui` (`packages/opencode/src/cli/cmd/tui.ts:130`); the
    CLI subcommand does not itself create a session — it dispatches into the TUI runtime
    which uses the SDK to call the same HTTP API as path #3.
- **Notes**:
  - There is a "TUI CLI" subcommand at `packages/opencode/src/cli/cmd/tui.ts`, but it does
    not create a session directly — it boots the TUI runtime in-process. The actual session
    create call is inside the TUI Solid.js prompt component, which calls the SDK (HTTP API).
  - When the TUI runs in `runInteractiveLocalMode` (CLI branch at
    `packages/opencode/src/cli/cmd/run.ts:847-867`), the SDK's `fetch` is replaced with
    `Server.Default().app.fetch` at `packages/opencode/src/cli/cmd/run.ts:840-844`, routing
    through the in-process opencode httpapi. The handler chain is identical, so the hook
    fires.
  - When the TUI runs in daemon mode (`packages/opencode/src/cli/cmd/tui.ts:188-235`), the
    SDK targets the standalone daemon HTTP server. The daemon server is the same
    `Server.Default()` (`packages/opencode/src/server/server.ts:55-60`), so the handler
    chain is identical. Hook fires.

### 3. HTTP API server
- **Status**: PASS
- **Entry point**: `POST /session` — declared at
  `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:203-214`,
  registered in `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:420`
  (`handlers.handleRaw("create", createRaw)`)
- **Call chain**:
  external `POST /session` request → `InstanceHttpApi` route table at
  `packages/opencode/src/server/routes/instance/httpapi/server.ts:158` (the
  `sessionHandlers` registration referenced via `packages/opencode/src/server/server.ts:9, :56`
  for the app mount) →
  `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:157-174` (`createRaw` →
  `create`) → `handlers/session.ts:153-155` (`shareSvc.create(ctx.payload)`) →
  `packages/opencode/src/share/session.ts:39-46` (`SessionShare.create` →
  `Session.Service.create`) → `packages/opencode/src/session/session.ts:709-731` →
  `packages/opencode/src/session/session.ts:577` (`events.publish(SessionV1.Event.Created, ...)`)
  → `packages/core/src/session/projector.ts:265-291` handler → `aiplusAudit` at
  `projector.ts:288`
- **Evidence**:
  - `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts:87, :203-214` — path
    and HttpApiEndpoint declaration
  - `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:153-155, :420` —
    handler + registration
  - `packages/opencode/src/share/session.ts:39-46` — `SessionShare.create` delegate
  - `packages/opencode/src/session/session.ts:709-731` — `Session.Service.create` → `createNext`
- **Notes**:
  - `SessionShare.create` at `packages/opencode/src/share/session.ts:39-46` may fork a
    background share side-effect (`:43-44`), but the create itself always routes through
    `Session.Service.create` → `createNext` → `events.publish(SessionV1.Event.Created, ...)`,
    so the hook always fires before any share side-effect.
  - The `InstanceContextMiddleware` and `WorkspaceRoutingMiddleware` on the group
    (`groups/session.ts:452-454`) only attach per-request routing context; they do not
    intercept the publish path.

### 4. task tool subagent
- **Status**: PASS
- **Entry point**: `packages/opencode/src/tool/task.ts:209-225` — the subagent's own session
  is created via `yield* sessions.create({...})` (`sessions` is the `Session.Service`
  yielded at `packages/opencode/src/tool/task.ts:153`)
- **Call chain**:
  `packages/opencode/src/tool/task.ts:209-225` (`yield* sessions.create({ parentID: ctx.sessionID, agent: next.name, ... })`)
  → `packages/opencode/src/session/session.ts:709-731` (`Session.Service.create` → `createNext`)
  → `packages/opencode/src/session/session.ts:577` (`events.publish(SessionV1.Event.Created, { sessionID, info })`)
  → `packages/core/src/session/projector.ts:265-291` handler → `aiplusAudit` at
  `projector.ts:288`
- **Evidence**:
  - `packages/opencode/src/tool/task.ts:147-156` — `TaskTool` definition with `Session.Service` injection
  - `packages/opencode/src/tool/task.ts:188-225` — the create branch (when no `task_id` is
    given for resume) calls `sessions.create({...})` at `:211-225`
  - `packages/opencode/src/tool/task.ts:153` — `const sessions = yield* Session.Service`
  - `packages/opencode/src/session/session.ts:577` — the `SessionV1.Event.Created` publish
- **Notes**:
  - When the subagent resumes an existing task via `params.task_id` (`:188-190`), no new
    session is created; `aiplusAudit` does not fire for the resume (correct — there is no
    new session to audit). This is the same behavior as the CLI's `--continue` path.
  - The Task tool's `createNext` call is the same code path used by all 4 paths in this
    report. Both the parent session (created when the parent agent first started) and
    the child subagent session (created here) get the hook on their respective
    `SessionV1.Event.Created` events.

## Summary

All four Owner-listed paths converge on a single, well-defined hook point:
`events.publish(SessionV1.Event.Created, ...)` in
`packages/opencode/src/session/session.ts:577`, consumed by the projector handler at
`packages/core/src/session/projector.ts:265-291`, which calls `aiplusAudit` at line 288
inside the `SessionV1.Event.Created` projection branch.

The `aiplusDispatchLog`, `aiplusCompactCheck`, `aiplusAudit`, and `aiplusManagedBlocks`
helpers at `projector.ts:100-135` are the only call sites of the four fire-and-forget
hooks — they are invoked exclusively from the `SessionV1.Event.Created` projection
(`projector.ts:286-289`), and the `events.project(SessionV1.Event.Created, ...)`
subscriber is wired in `SessionProjector.layer` (`projector.ts:260-291`). The
projector's `defaultLayer` is composed into `SessionV2.defaultLayer` at
`packages/core/src/session.ts:485-492`, which is the runtime shared by every session
creation path I traced.

The publish boundary is consistent: `Session.Service` (opencode) uses
`EventV2Bridge.Service` (`packages/opencode/src/session/session.ts:538`,
`packages/opencode/src/event-v2-bridge.ts:38, :75`), which delegates to the core
`EventV2.Service` that the projector subscribes to. The V2 path
(`packages/core/src/session.ts:284`) also publishes `SessionV1.Event.Created` against
the same core `EventV2.Service`, so any future caller of `SessionV2.Service.create`
(e.g. the unified server at `packages/server/src/handlers/session.ts:65-77`) would also
fire the hook — though no V2 caller is currently in the Owner's 4 paths.

No gaps were found.

## Files modified

- `.aiplus/agent-memory/advisor/audit-hook-coverage-20260616.md` (this report, created)

## Recommended actions

None — all 4 session creation paths reach `aiplusAudit` via the
`SessionV1.Event.Created` event projection in
`packages/core/src/session/projector.ts:288`.
