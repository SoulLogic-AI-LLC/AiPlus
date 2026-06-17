import { execFileSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { list as listLeases } from "../../../aiplus/worktree"

export interface StaleWorktree {
  /** Filesystem path of the worktree */
  path: string
  /** Branch name (short, without refs/heads/ prefix) */
  branch: string
  /** Why this worktree is considered stale */
  reason: "merged" | "deleted"
}

export type SkipReason = "active_lease" | "uncommitted_changes" | "current_worktree"

export interface SkippedWorktree {
  path: string
  branch: string
  reasons: SkipReason[]
}

function runGit(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" }).trim()
  } catch {
    return ""
  }
}

/**
 * Parse `git worktree list --porcelain` output.
 * Returns entries with at least a `path` field; `branch` may be absent for detached HEADs.
 */
export function parseWorktreeList(output: string): { path: string; branch?: string }[] {
  const entries: { path: string; branch?: string }[] = []
  let current: { path?: string; branch?: string } = {}
  for (const line of output.split("\n")) {
    if (!line) continue
    if (line.startsWith("worktree ")) {
      if (current.path) {
        entries.push({ path: current.path, branch: current.branch })
      }
      current = { path: line.slice("worktree ".length) }
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "")
    }
  }
  if (current.path) {
    entries.push({ path: current.path, branch: current.branch })
  }
  return entries
}

/**
 * List all local worktrees (including main). Returns path + optional branch.
 */
export function listWorktrees(repoRoot: string): { path: string; branch?: string }[] {
  const output = runGit(["worktree", "list", "--porcelain"], repoRoot)
  if (!output) return []
  return parseWorktreeList(output)
}

/**
 * Get remote branches already merged into origin/dev.
 * Returns branch short names (without `origin/` prefix).
 */
export function getMergedBranches(repoRoot: string): Set<string> {
  const output = runGit(["branch", "-r", "--merged", "origin/dev"], repoRoot)
  return new Set(
    output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^origin\//, ""))
      .filter((l) => l !== "dev" && l !== "HEAD"),
  )
}

/**
 * Get all remote branch short names (without `origin/` prefix).
 */
export function getAllRemoteBranches(repoRoot: string): Set<string> {
  const output = runGit(["branch", "-r"], repoRoot)
  return new Set(
    output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^origin\//, "").replace(/ -> .*$/, ""))
      .filter((l) => l !== "HEAD"),
  )
}

/**
 * Detect stale worktrees: branches that have been merged into origin/dev,
 * or no longer exist on the remote.
 */
export function findStaleWorktrees(repoRoot: string): StaleWorktree[] {
  const worktrees = listWorktrees(repoRoot)
  if (worktrees.length === 0) return []

  // Only fetch if we have worktrees to check (avoid unnecessary network ops)
  runGit(["fetch", "origin", "dev"], repoRoot)

  const merged = getMergedBranches(repoRoot)
  const allRemote = getAllRemoteBranches(repoRoot)

  const stale: StaleWorktree[] = []
  for (const wt of worktrees) {
    if (!wt.branch) continue // detached HEAD — skip
    if (wt.branch === "dev" || wt.branch === "main" || wt.branch === "master") continue // don't touch primary branches

    // Normalize worktree path for comparisons
    const normalized = path.normalize(wt.path)

    if (merged.has(wt.branch)) {
      stale.push({ path: normalized, branch: wt.branch, reason: "merged" })
      continue
    }
    if (!allRemote.has(wt.branch)) {
      stale.push({ path: normalized, branch: wt.branch, reason: "deleted" })
    }
  }

  return stale
}

// ---------------------------------------------------------------------------
// Safety gates — all four must pass before a worktree is removed.
// ---------------------------------------------------------------------------

/** Gate ①: No active lease in leases.json. */
function hasActiveLease(worktreePath: string, repoRoot: string): boolean {
  const leases = listLeases(repoRoot)
  return leases.some((l) => l.status === "active" && path.normalize(l.worktreePath) === worktreePath)
}

/** Gate ②: Branch is merged or deleted on remote (already baked into findStaleWorktrees). */

/** Gate ③: No uncommitted changes in the worktree. */
function hasUncommittedChanges(worktreePath: string): boolean {
  const status = runGit(["status", "--porcelain"], worktreePath)
  return status.length > 0
}

/** Gate ④: Not the current worktree (don't remove yourself). */
function isCurrentWorktree(worktreePath: string): boolean {
  const cwd = path.resolve(process.cwd())
  const wt = path.resolve(worktreePath)
  return cwd === wt || cwd.startsWith(wt + path.sep)
}

/**
 * Collect safety gate violations for a stale worktree.
 * Returns the list of reasons why this worktree should be skipped.
 * An empty array means all gates pass — safe to remove.
 */
function checkSafetyGates(worktreePath: string, repoRoot: string): SkipReason[] {
  const reasons: SkipReason[] = []

  if (hasActiveLease(worktreePath, repoRoot)) {
    reasons.push("active_lease")
  }
  if (hasUncommittedChanges(worktreePath)) {
    reasons.push("uncommitted_changes")
  }
  if (isCurrentWorktree(worktreePath)) {
    reasons.push("current_worktree")
  }

  return reasons
}

/**
 * Remove a single worktree via `git worktree remove --force`, then clean up
 * the directory. Returns true on success.
 */
export function removeWorktree(repoRoot: string, worktreePath: string): boolean {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd: repoRoot,
      stdio: "pipe",
    })
  } catch {
    // worktree may already be removed; try cleaning directory
  }

  // Clean up the directory if it still exists
  try {
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true })
    }
    return true
  } catch {
    return false
  }
}

export interface CleanupResult {
  stale: StaleWorktree[]
  skipped: SkippedWorktree[]
  removed: string[]
  failed: string[]
}

/**
 * Find and clean stale worktrees.
 *
 * Four safety gates (all must pass):
 *   ① No active lease in leases.json
 *   ② Remote branch merged or deleted (via findStaleWorktrees)
 *   ③ No uncommitted changes (git status --porcelain)
 *   ④ Not the current worktree
 *
 * @param repoRoot  Main repository path (where git worktree list is run from)
 * @param dryRun    If true, only detect — do not remove.
 */
export function cleanupStale(repoRoot: string, dryRun: boolean = false): CleanupResult {
  const stale = findStaleWorktrees(repoRoot)
  const skipped: SkippedWorktree[] = []
  const removed: string[] = []
  const failed: string[] = []

  for (const wt of stale) {
    const reasons = checkSafetyGates(wt.path, repoRoot)
    if (reasons.length > 0) {
      skipped.push({ path: wt.path, branch: wt.branch, reasons })
      continue
    }
    if (dryRun) continue
    const ok = removeWorktree(repoRoot, wt.path)
    if (ok) {
      removed.push(wt.path)
    } else {
      failed.push(wt.path)
    }
  }

  return { stale, skipped, removed, failed }
}

/**
 * Format a cleanup result for CLI output.
 */
export function formatResult(result: CleanupResult, dryRun: boolean): string {
  const lines: string[] = []

  if (result.stale.length === 0) {
    lines.push("AiPlus Worktree Clean: no stale worktrees found")
    return lines.join("\n")
  }

  lines.push(dryRun ? "AiPlus Worktree Clean (dry-run)" : "AiPlus Worktree Clean")
  lines.push(`  found ${result.stale.length} stale worktree(s)`)

  for (const wt of result.stale) {
    const skipped = result.skipped.find((s) => s.path === wt.path)
    if (skipped) {
      const reasons = skipped.reasons.join(", ")
      lines.push(`  [SKIP ${reasons}] ${wt.path} (branch: ${wt.branch}, reason: ${wt.reason})`)
    } else if (dryRun) {
      lines.push(`  [DRY-RUN] ${wt.path} (branch: ${wt.branch}, reason: ${wt.reason})`)
    } else {
      lines.push(`  [STALE] ${wt.path} (branch: ${wt.branch}, reason: ${wt.reason})`)
    }
  }

  if (!dryRun) {
    if (result.removed.length > 0) {
      lines.push(`  removed ${result.removed.length} worktree(s)`)
    }
    if (result.failed.length > 0) {
      lines.push(`  failed ${result.failed.length} worktree(s)`)
    }
  }

  return lines.join("\n")
}

export * as WorktreeCleanup from "./worktree-cleanup"
