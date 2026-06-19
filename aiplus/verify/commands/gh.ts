/**
 * Verify CLI — GitHub Command
 *
 * Verify GitHub PR status and CI checks.
 */

import { execSync } from "node:child_process"
import { formatGhChecks } from "../format"
import type { GhPrCheck } from "../types"

/** Run gh verify command — check open PRs and their CI status. */
export function ghCommand(repo?: string, prNumber?: number): string {
  try {
    if (prNumber) {
      return formatGhChecks([getPrCheck(prNumber)])
    }
    return formatGhChecks(getOpenPrChecks(repo))
  } catch (err) {
    return `\n  ✗ GitHub verification failed: ${err instanceof Error ? err.message : String(err)}\n`
  }
}

/** Get check status for a specific PR. */
function getPrCheck(pr: number): GhPrCheck {
  const raw = execSync(`gh pr view ${pr} --json number,title,state,statusCheckRollup,url`, {
    encoding: "utf-8",
    timeout: 15000,
  })
  const data = JSON.parse(raw)
  return {
    pr: data.number,
    title: data.title,
    state: data.state,
    statusCheckRollup: data.statusCheckRollup?.conclusion ?? data.statusCheckRollup?.state ?? null,
    url: data.url,
  }
}

/** Get check statuses for all open PRs. */
function getOpenPrChecks(repo?: string): GhPrCheck[] {
  const repoFlag = repo ? `--repo ${repo}` : ""
  const raw = execSync(`gh pr list ${repoFlag} --json number,title,state,statusCheckRollup,url --limit 10`, {
    encoding: "utf-8",
    timeout: 15000,
  })
  const data = JSON.parse(raw) as Array<{
    number: number
    title: string
    state: string
    statusCheckRollup: { conclusion?: string; state?: string } | null
    url: string
  }>
  return data.map((pr) => ({
    pr: pr.number,
    title: pr.title,
    state: pr.state as GhPrCheck["state"],
    statusCheckRollup: (pr.statusCheckRollup?.conclusion ??
      pr.statusCheckRollup?.state ??
      null) as GhPrCheck["statusCheckRollup"],
    url: pr.url,
  }))
}
