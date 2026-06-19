# Changelog

> Forked from OpenCode at commit f884766. Diverged at v0.1.0.
> AiPlus-Native versions track our own semver, independent of upstream.

## Unreleased

### Daemon install / watchdog stabilization
- `install.sh` now re-creates the canonical hardlinked install pair `aiplus-native` + `aiplus-daemon` on every install/upgrade after binary replacement
- launchd now targets `aiplus-daemon` and migrates the legacy `com.aiplus.aiplus-native-daemon` label/path on reinstall
- `scripts/opencode-watchdog.sh` now tracks the shared fixed daemon port `37367` and recognizes both current + legacy launchd labels during migration
- install/docs now explain the shared user-scoped daemon model, fixed port `37367`, and why `~/.local/bin/aiplus-native-next` is only a local wrapper

## v0.3.0 (2026-06-16)

### Unified Backend (Phase 1-3)
- **Phase 1**: Daemon extraction — `opencode daemon` command, dual-mode transport (daemon + standalone), TUI auto-detection, port file management
- **Phase 2**: WebSocket upgrade — `/global/ws` route, message protocol, TUI WebSocket client with SSE fallback, streaming switchover
- **Phase 3**: TUI slimming — Worker fallback mode removed, ConfigService dependency cut from TUI, auth-header split, runtime cleanup (~58% memory reduction)
- `worker.ts` reintroduction via upstream `origin/dev` merge is expected upstream-merge behavior, not an AiPlus regression (TUI runtime path remains ConfigService-free)
- Launchd auto-restart watchdog (3s crash recovery, auto-start at login/reboot)
- install.sh auto-installs launchd plist (zero user setup)
- Daemon alive-status three-state detection (alive/unauthorized/dead)

### Model System
- 19 models available for CEO/CA dispatch (13 paid + 6 free)
- Fixed model parameter dispatch: OpenRouter prefix bug resolved, provider-aware MODEL_MAP
- Kimi K2.7 Code as primary coding model
- Dynamic model selection rules in CEO/CA personas
- AMTP query tool (queryByRole/queryBudget/queryRecent)

### Memory Enhancement (Stages 1-6)
- TeamEntry/ProjectEntry schema extended, conflict detector, supersedes support
- Risk classifier, craft marker system, CraftEntry type
- Stage 6: processCraftMarkers integrated into session lifecycle (fire-and-forget)

### Agent Infrastructure
- Engineer-A/B write/edit/bash permissions fixed (project-wide file access)
- Advisor pre-hook three-layer defense (CA verification rule + audit hook coverage + evidence gate)
- Constitution §II.8: Coordination roles do not execute
- opencode.jsonc permissions: task/edit/write/bash auto-approve, external dirs allow
- CA dispatch permission granted (agent-team-*)

### Operational
- Launchd daemon watchdog with install.sh integration
- scripts/opencode-watchdog.sh helper (status/restart/logs)
- Zombie daemon prevention (dedup on spawn, stale port cleanup)
- Tmux → launchd migration for daemon supervision

### Sub-agent Memory Threshold
- Three-tier model: < 0.75GB hard block, 0.75-1.5GB warn, ≥ 1.5GB dynamic allocation
- Orphan lease fix (pending-* leases auto-ignored after 10s)

### Hook Wiring
- `SessionProjector.node` wired into CLI/TUI session runtime layer — 4 AiPlus hooks (dispatch log, compact check, audit verify, managed blocks) now fire on all session lifecycle paths: HTTP API server, CLI, TUI, task tool subagent
- AiPlus hooks registered as event subscribers on `SessionV1.Event.Created` in SessionProjector, not just inline in `SessionV2.create()` — decoupled from CLI dispatch path
- Memory write (`appendMemoryEntry`) on session interrupt

### aiplus-native init
- `aiplus-native init` — bootstrap 20 persona `.md` files + `agent-team.toml` with `execution.backend = "opencode"` + `.aiplus/` skeleton (dispatch-log, execution-state, memory, worktree, compact)
- P0 fix: InitCommand registered before TuiThreadCommand — prevents yargs `$0 [project]` positional from swallowing `init` as a project argument

### Memory V2
- `appendTeamEntry` / `appendProjectEntry` exports (3-layer memory: personal → team → project)
- JSON-safe redact regex: backreference `(["']?)(...)\1` prevents eating JSON structural quotes on rules r5-r8

### Infrastructure
- Root bun test: guard removed (`"do not run tests from root"` → `bun test --filter 'packages/' --filter 'aiplus/'`), `bunfig.toml` test root fixed (`"./do-not-run-tests-from-root"` → `"."`)
- Upstream version auto-check permanently disabled
- Binary distribution: `install.sh` + GitHub Actions release pipeline (macOS arm64, `gh release download` primary)

### TUI Branding
- Title bar: `"opencode"` → `"AiPlus"`
- MCP status indicator removed from footer
- Hint bar: `"AiPlus · F2 lobby · F3 dispatch"`

### C.4 Delivery
- C.4 doctor: unified health check CLI
- C.4 secret-broker run: alias → env → spawn

### Persona
- no-empty-prompt rule: advisor + ceo Default Doesn't block empty prompts

### Scope Plans
- overclaim rerun v1 scope plan approved (9-allowlist + 8-gate + --json/--gate) — execution deferred to v0.3.0
- Source → Native full gap analysis completed (45 CLI commands, 22 agent subcommands, 4 Source-only logic layers)

### Test Coverage
- 68/68 aiplus tests green
- Root `bun test` functional (1 pre-existing upstream Linux-only failure — not blocking)

### AMTP Performance Tracking
- Agent-Model-Task Performance database: 10 dimensions tracked per task execution (token cost, latency, tool calls, success/failure, model, effort, etc.)
- Dynamic model selection in task tool: model + effort params, GPT-5.4 approval gate
- Static pricing table: 7 models
- 142 tests pass

### Sub-agent Memory Threshold
- Three-tier memory model replaces flat formula
- < 0.75GB hard block, 0.75-1.5GB allow 1 with warning, ≥ 1.5GB ceil((free-0.75)/0.65)

### Orphan Lease Fix
- Skip pending-* leases after 10s grace period in lane status
- Prevents permanent lane blocking after failed prompt delivery
