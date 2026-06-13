# AiPlus-Native

**OpenCode, augmented with the AiPlus agent team layer.**

![v0.0.4](https://img.shields.io/badge/version-v0.0.4-blue)
![7/7 capabilities](https://img.shields.io/badge/capabilities-7%2F7-green)
![20 personas](https://img.shields.io/badge/personas-20-orange)
![License](https://img.shields.io/badge/license-Apache%202.0-green)

---

## Quick Start

### One-line install (macOS Apple Silicon)

```bash
curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/main/install.sh | bash
aiplus-native
```

Downloads a prebuilt binary for macOS arm64. Linux/Windows binaries planned for future releases.

### Developer (from source)

```bash
git clone git@github.com:izhiwen/AiPlus-Native.git
cd AiPlus-Native && bun install
bun run dev
```

Requires **Bun ≥ 1.3.14**.

```bash
# Optional: one-word launch via alias (replace path with your clone location)
echo "alias aiplus-native='cd ~/code/AiPlus-Native && bun run dev'" >> ~/.zshrc
source ~/.zshrc
aiplus-native
```

---

## 7/7 Core Capabilities

| # | Capability | Description |
|---|------------|-------------|
| 1 | **Persona System** | 20 roles with pillar-based permissions (YAML frontmatter) |
| 2 | **Dispatch Log** | JSONL tamper-evident task tracking with hash chain |
| 3 | **Worktree Lease** | Lane fencing + auto GC (24h expiry) |
| 4 | **Compact Handoff** | Per-model thresholds + pressure gauge |
| 5 | **Agent Memory** | Session end → persistent memory hook (JSONL) |
| 6 | **Audit Hook** | D1/D2/D3 automated integrity checks |
| 7 | **Effect Gateway** | 4-level side-effect classification + idempotency blocking |

---

## 20 Personas

Roles are grouped by **pillar** — each pillar has distinct permissions and responsibilities.

### 🟢 Strategist

| Role | Description |
|------|-------------|
| Advisor | Frames decisions, challenges premises, distinguishes reversible from irreversible |

### 🔵 Coordinator

| Role | Description |
|------|-------------|
| CEO | Execution coordinator — task scoping, role staffing, sequencing |

### 🟡 Builder

| Role | Description |
|------|-------------|
| PM | Scope cuts, acceptance criteria, definition of done |
| Architect | Data flow, coupling, failure modes, long-term reversibility |
| Engineer A | Primary implementation — code, tests, clean branches |
| Engineer B | Secondary implementation — parallel builder with file-ownership boundaries |
| DevOps | CI/CD, deploy, rollback, monitoring, SLOs |
| Tech Writer | README, docs, error messages, onboarding flow |
| Researcher | Best-practice hunter, benchmark methodology, dissenting opinions |
| AI Integration | LLM workflows, prompts, model choice, tool calling, evals, fallbacks |
| Integration Manager | Neutral lane integration — discovery, dry-run, merge order |
| UI Designer | User paths, interaction flow, states, recovery, usability |

### 🔴 Verifier

| Role | Description |
|------|-------------|
| Reviewer | Adversarial code review — PASS/REVISE/BLOCKED verdicts |
| QA | Behavior validator — reproducible tests per acceptance criterion |
| Security Reviewer | Secrets, auth, privacy, billing, automation side effects |
| Chief Auditor | Read-only verification coordinator |
| Evidence Auditor | Claims vs git diff/CI/artifacts/dogfood comparison |
| Release Manager | PR status, CI/checks, release checklist, tag/release/smoke |
| CQO | Quality-chain judge — cross-verifies AC/implementation/reviewer |
| Performance Auditor | Velocity data, agent performance, quantitative reports |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  OpenCode (TypeScript, Effect, SQLite)      │
│  └─ packages/core/src/session/runner/       │
│       └─ tool registry (tool calls)         │
└────────────────┬────────────────────────────┘
                 │ hook onto session lifecycle
┌────────────────▼────────────────────────────┐
│  aiplus/ layer                              │
│  ├─ agents/     (20 persona .md files)      │
│  ├─ dispatch/   (dispatch-log.jsonl)        │
│  ├─ worktree/   (leases.json)               │
│  ├─ compact/    (pressure gauge)            │
│  ├─ memory/     (session → JSONL)           │
│  ├─ audit/      (D1/D2/D3 checks)          │
│  └─ effects/    (side-effect gateway)       │
└─────────────────────────────────────────────┘
```

**One sentence**: OpenCode fork + `aiplus/` layer → hook onto session lifecycle.

---

## AiPlus-Native vs AiPlus-Source

| | AiPlus-Source | AiPlus-Native |
|---|---------------|---------------|
| **Language** | Rust | TypeScript |
| **Runtime** | Current production | Next-gen (OpenCode fork) |
| **Status** | Maintenance-only | Under active development |
| **CLI** | `aiplus` binary | `opencode` + `aiplus/` layer |
| **Persona delivery** | Embedded in binary | `.md` files in `aiplus/agents/` |
| **Hook model** | Subprocess dispatch | In-process session lifecycle |

---

## Roadmap

### ✅ v0.0.3 — 7-in-1 Release
- Lobby CLI — `aiplus lobby status|bind|resume`
- GAP-1 idempotencyKey + GAP-2 hash chain
- Token cost tracking per role/session
- Velocity estimation (p50/p90)
- GAP-6 session resume compact pressure
- GAP-3/4 audit module fixes
- GAP-10 secret broker

### ✅ v0.0.3 — B0 REST API + B1 Lobby Dashboard
- `GET /aiplus/lobby/status|dispatch|compact/capsule|personas`
- TUI `home_bottom` lobby widget + F2 full-screen route

### ✅ v0.1.0 — Binary Distribution
- `bun build --compile` → macOS arm64 standalone binary
- `install.sh` one-liner installer
- GitHub Actions release pipeline (tag → build → upload)

### 📋 v1.0
- 3-layer memory: session → project → global
- B2 Dispatch kanban board (TUI route)
- B3 Compact pressure gauge (TUI sidebar)
- Effect gateway monitor

---

## License

OpenCode is licensed under [Apache 2.0](LICENSE).

AiPlus additions (the `aiplus/` layer) are also licensed under Apache 2.0.
