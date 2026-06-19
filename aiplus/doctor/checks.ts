/**
 * Doctor — Individual Checks
 *
 * Each check returns a DoctorCheck with verdict and detail.
 * Checks are fire-and-forget — errors degrade to REVISE, never throw.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import { checkDispatchChain } from "../audit/dispatch-integrity"
import { checkMemoryMatch } from "../audit/memory-match"
import { checkPersonaPermissions } from "../audit/permission-check"
import { listAliases } from "../secret-broker/query"
import { COMPACT_THRESHOLDS } from "../compact/thresholds"
import type { DoctorCheck } from "./types"

/** Audit check — D1 dispatch chain + D2 memory match + D3 persona permissions. */
export function checkAudit(projectRoot: string): DoctorCheck {
  try {
    const checks = [
      checkDispatchChain(projectRoot),
      checkMemoryMatch(projectRoot),
      checkPersonaPermissions(projectRoot),
    ]

    const hasBlocked = checks.some((c) => c.status === "BLOCKED")
    const hasRevise = checks.some((c) => c.status === "REVISE")
    const status = hasBlocked ? "BLOCKED" : hasRevise ? "REVISE" : "PASS"

    const summary = checks.map((c) => `${c.id}:${c.status}`).join(", ")
    return {
      id: "audit",
      name: "Audit (D1/D2/D3)",
      status,
      detail: `${summary} — ${checks.length} checks`,
    }
  } catch (err) {
    return {
      id: "audit",
      name: "Audit (D1/D2/D3)",
      status: "REVISE",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Lobby check — dispatch log + leases + state exist. */
export function checkLobby(projectRoot: string): DoctorCheck {
  try {
    const dispatchLog = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
    const leases = path.join(projectRoot, ".aiplus", "worktree", "leases.json")
    const state = path.join(projectRoot, ".aiplus", "lobby", "state.json")

    const hasDispatch = fs.existsSync(dispatchLog)
    const hasLeases = fs.existsSync(leases)
    const hasState = fs.existsSync(state)

    const missing = []
    if (!hasDispatch) missing.push("dispatch-log")
    if (!hasLeases) missing.push("leases")
    if (!hasState) missing.push("state")

    if (missing.length === 3) {
      return {
        id: "lobby",
        name: "Lobby",
        status: "REVISE",
        detail: "no lobby data — dispatch-log, leases, state all missing",
      }
    }

    const parts = []
    if (hasDispatch) {
      const lines = fs
        .readFileSync(dispatchLog, "utf-8")
        .split("\n")
        .filter((l) => l.trim())
      parts.push(`dispatch:${lines.length} entries`)
    }
    if (hasLeases) parts.push("leases:ok")
    if (hasState) parts.push("state:ok")

    return {
      id: "lobby",
      name: "Lobby",
      status: "PASS",
      detail: parts.join(", "),
    }
  } catch (err) {
    return {
      id: "lobby",
      name: "Lobby",
      status: "REVISE",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Secret-broker check — aliases available from auth.json + credential_db. */
export function checkSecretBroker(): DoctorCheck {
  try {
    const aliases = listAliases()

    if (aliases.length === 0) {
      return {
        id: "secret-broker",
        name: "Secret Broker",
        status: "REVISE",
        detail: "no aliases found — auth.json and credential_db both empty",
      }
    }

    const bySource = {
      auth: aliases.filter((a) => a.source === "auth.json").length,
      db: aliases.filter((a) => a.source === "credential_db").length,
    }

    return {
      id: "secret-broker",
      name: "Secret Broker",
      status: "PASS",
      detail: `${aliases.length} aliases (auth:${bySource.auth}, db:${bySource.db})`,
    }
  } catch (err) {
    return {
      id: "secret-broker",
      name: "Secret Broker",
      status: "REVISE",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** Compact check — thresholds configured for known models. */
export function checkCompact(): DoctorCheck {
  try {
    const models = Object.keys(COMPACT_THRESHOLDS)

    if (models.length === 0) {
      return {
        id: "compact",
        name: "Compact",
        status: "REVISE",
        detail: "no compact thresholds configured",
      }
    }

    return {
      id: "compact",
      name: "Compact",
      status: "PASS",
      detail: `${models.length} models configured: ${models.join(", ")}`,
    }
  } catch (err) {
    return {
      id: "compact",
      name: "Compact",
      status: "REVISE",
      detail: `error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
