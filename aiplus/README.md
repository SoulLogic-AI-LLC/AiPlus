# AiPlus Layer on OpenCode

This directory contains the AiPlus differentiation layer — built on top of the OpenCode fork, not modifying core code.

## Structure

```
aiplus/
├── agents/         # AiPlus persona files (OpenCode-compatible markdown with YAML frontmatter)
├── memory/         # Agent memory integration
├── dispatch/       # Dispatch log + hash chain
├── worktree/       # Worktree lease management
├── compact/        # Compact handoff hooks
├── audit/          # CA audit hooks
└── effects/        # Effect Gateway (idempotency + side-effect tracking)
```

## Integration points

1. **Persona injection**: Place AiPlus persona markdown files in an `agents/` or `.opencode/agents/` directory that OpenCode's config loader scans. No core code change needed.
2. **Plugin system**: Register AiPlus tools/hooks via OpenCode's plugin mechanism (`packages/plugin/`).
3. **Config overlay**: Use `.opencode/config.json` overrides for AiPlus-specific settings.

## PR #3 scope notes (Owner-approved 2026-06-13)

### Lease file locking
- `.aiplus/worktree/leases.json` is a single JSON file (array), not JSONL
- Concurrent writes from multiple sessions MUST use flock (advisory file lock)
- No append-only — read-modify-write under flock

### GC exit for orphan worktrees
- Expired leases (24h past `expiresAt`) → auto `git worktree remove` on doctor/lobby startup
- Prevents orphan accumulation (known issue from W2 cleanup in AiPlus-Source)
- Keep the "don't remove on destroy" safety — GC is the cleanup path
