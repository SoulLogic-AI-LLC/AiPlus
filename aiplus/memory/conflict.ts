/**
 * Agent Memory — Conflict & Stale Detection (V2)
 *
 * Pure functions: take parsed records, return reports. No file I/O.
 */

export interface ConflictCapable {
  id: string
  summary: string
  status: string
  conflictGroup: string | null
  supersedes: readonly string[]
  supersededBy: readonly string[]
  confidence: string
  expiresAt: string | null
  staleAfter: string | null
}

export interface ConflictReport {
  readonly recordId: string
  readonly conflictType:
    | "conflict_group_divergence"
    | "missing_superseded"
    | "circular_supersede"
  readonly description: string
  readonly relatedIds: readonly string[]
}

export interface StaleReport {
  readonly recordId: string
  readonly reason: "confidence_marked_stale" | "expired" | "stale_after_elapsed"
}

/**
 * Detect conflicts across a set of records.
 *
 * Three conflict types:
 * 1. conflict_group_divergence: ≥2 entries share a non-null conflictGroup
 *    but have different summary values.
 * 2. missing_superseded: an entry's supersedes array references an id
 *    that doesn't exist in the provided records.
 * 3. circular_supersede: A.supersedes contains B and B.supersedes contains A.
 */
export function detectConflicts(
  records: readonly ConflictCapable[],
): readonly ConflictReport[] {
  const byId = new Map(records.map(r => [r.id, r]))
  const reports: ConflictReport[] = []

  // 1. conflict_group_divergence
  const groups = new Map<string, ConflictCapable[]>()
  for (const r of records) {
    if (r.conflictGroup === null) continue
    const existing = groups.get(r.conflictGroup) ?? []
    existing.push(r)
    groups.set(r.conflictGroup, existing)
  }
  for (const [groupName, members] of groups) {
    const uniqueSummaries = new Set(members.map(m => m.summary))
    if (uniqueSummaries.size >= 2) {
      const relatedIds = members.map(m => m.id)
      for (const member of members) {
        reports.push({
          recordId: member.id,
          conflictType: "conflict_group_divergence",
          description: `conflict group "${groupName}" has divergent summaries`,
          relatedIds,
        })
      }
    }
  }

  // 2. missing_superseded
  for (const r of records) {
    for (const refId of r.supersedes) {
      if (!byId.has(refId)) {
        reports.push({
          recordId: r.id,
          conflictType: "missing_superseded",
          description: `supersedes non-existent entry "${refId}"`,
          relatedIds: [refId],
        })
      }
    }
  }

  // 3. circular_supersede
  const seen = new Set<string>()
  for (const r of records) {
    for (const refId of r.supersedes) {
      const other = byId.get(refId)
      if (other?.supersedes.includes(r.id)) {
        const pairKey = [r.id, refId].sort().join(":")
        if (seen.has(pairKey)) continue
        seen.add(pairKey)
        reports.push({
          recordId: r.id,
          conflictType: "circular_supersede",
          description: `circular supersede between "${r.id}" and "${refId}"`,
          relatedIds: [r.id, refId],
        })
      }
    }
  }

  return reports
}

/**
 * Detect stale records.
 *
 * Three stale reasons:
 * 1. confidence_marked_stale: confidence === "stale"
 * 2. expired: now > parseInt(expiresAt)
 * 3. stale_after_elapsed: now > parseInt(staleAfter)
 */
export function detectStale(
  records: readonly ConflictCapable[],
  now?: number,
): readonly StaleReport[] {
  const currentTime = now ?? Date.now()
  const reports: StaleReport[] = []

  for (const r of records) {
    if (r.confidence === "stale") {
      reports.push({ recordId: r.id, reason: "confidence_marked_stale" })
      continue
    }
    if (r.expiresAt !== null && currentTime > parseInt(r.expiresAt)) {
      reports.push({ recordId: r.id, reason: "expired" })
      continue
    }
    if (r.staleAfter !== null && currentTime > parseInt(r.staleAfter)) {
      reports.push({ recordId: r.id, reason: "stale_after_elapsed" })
    }
  }

  return reports
}
