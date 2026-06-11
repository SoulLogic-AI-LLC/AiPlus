# AiPlus

AI agent team orchestration — build software with a team of AI agents.

## What is AiPlus?

AiPlus gives you a team of specialized AI agents — Advisor, CEO, Architect,
Engineer, QA, Reviewer, and more — each with a defined role and expertise.
Dispatch work, verify output, stay in control. All from your terminal.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus/main/install.sh | sh
```

Or download a binary from [Releases](https://github.com/izhiwen/AiPlus/releases).

## Platforms

- macOS (Apple Silicon · Intel)
- Linux (x86_64 · aarch64)
- Windows (x86_64)

## Quick Start

```bash
cd your-project
aiplus init              # one-time setup

aiplus agent list        # see your team

aiplus agent route engineer-a "add health check endpoint"   # dispatch work
aiplus agent talk advisor                                   # talk to an agent
```

## Agent Team

| Role | Does |
|------|------|
| **Advisor** | Strategic second opinion — challenges framing before resources commit |
| **CEO** | Execution coordinator — scopes tasks, staffs roles, reports status |
| **Architect** | System design — flags hard-to-reverse decisions |
| **Engineer** | Implementation — writes code, tests, clean branches |
| **QA** | Behavior validator — reproducible tests, PASS/FAIL per criteria |
| **Reviewer** | Adversarial code review — PASS / REVISE / BLOCKED |
| **Security Reviewer** | Secrets, auth, privacy, external accounts |
| **PM** | Scope cuts, acceptance criteria, definition of done |
| **UI Designer** | User paths, interaction flow, states, recovery |

Full roster: `aiplus agent list`

## Documentation

- [Getting Started](https://github.com/izhiwen/AiPlus/wiki)
- [CLI Reference](https://github.com/izhiwen/AiPlus/wiki/cli)
- [Agent Team Guide](https://github.com/izhiwen/AiPlus/wiki/agent-team)

---

Built with Rust. Driven by AI agents. Controlled by you.
