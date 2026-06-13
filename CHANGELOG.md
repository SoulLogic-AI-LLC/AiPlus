# Changelog

> Forked from OpenCode at commit f884766. Diverged at v0.1.0.
> AiPlus-Native versions track our own semver, independent of upstream.

## v0.2.0 (2026-06-14)

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
