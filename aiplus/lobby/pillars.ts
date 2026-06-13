/**
 * Lobby CLI — Pillar Mapping (V1)
 *
 * Hardcoded pillar classification for 20 AiPlus Agent Team roles.
 * V2: configurable via aiplus/lobby/pillars.json if needed.
 */

import type { Pillar } from "./types"

/** Role → Pillar mapping. */
const PILLAR_MAP: Record<string, Pillar> = {
  // CORE (Coordinator)
  "ceo": "coordinator",
  "advisor": "coordinator",
  "pm": "coordinator",
  "architect": "coordinator",

  // REVIEWER (Verifier)
  "reviewer": "verifier",
  "qa": "verifier",
  "security-reviewer": "verifier",
  "chief-auditor": "verifier",
  "evidence-auditor": "verifier",
  "release-manager": "verifier",
  "cqo": "verifier",
  "performance-auditor": "verifier",

  // BUILDER (Expert)
  "engineer-a": "expert",
  "engineer-b": "expert",
  "devops": "expert",
  "tech-writer": "expert",
  "researcher": "expert",
  "ai-integration": "expert",
  "integration-manager": "expert",
  "ui-designer": "expert",
}

/** Display names for roles. */
const DISPLAY_NAMES: Record<string, string> = {
  "ceo": "CEO",
  "advisor": "Advisor",
  "pm": "PM",
  "architect": "Architect",
  "reviewer": "Reviewer",
  "qa": "QA",
  "security-reviewer": "Security Reviewer",
  "chief-auditor": "Chief Auditor",
  "evidence-auditor": "Evidence Auditor",
  "release-manager": "Release Manager",
  "cqo": "CQO",
  "performance-auditor": "Performance Auditor",
  "engineer-a": "Engineer A",
  "engineer-b": "Engineer B",
  "devops": "DevOps",
  "tech-writer": "Tech Writer",
  "researcher": "Researcher",
  "ai-integration": "AI Integration",
  "integration-manager": "Integration Manager",
  "ui-designer": "UI Designer",
}

/** Get pillar for a role ID. */
export function getPillar(roleId: string): Pillar {
  return PILLAR_MAP[roleId] ?? "expert"
}

/** Get display name for a role ID. */
export function getDisplayName(roleId: string): string {
  return DISPLAY_NAMES[roleId] ?? roleId
}

/** Get all roles for a pillar. */
export function getRolesByPillar(pillar: Pillar): string[] {
  return Object.entries(PILLAR_MAP)
    .filter(([_, p]) => p === pillar)
    .map(([id]) => id)
}

/** Get all pillar names in display order. */
export function getPillarOrder(): Pillar[] {
  return ["coordinator", "verifier", "expert"]
}

/** Get pillar display label. */
export function getPillarLabel(pillar: Pillar): string {
  switch (pillar) {
    case "coordinator": return "🟢 CORE (Coordinator)"
    case "verifier": return "🔵 REVIEWER (Verifier)"
    case "expert": return "🟡 BUILDER (Expert)"
  }
}

/** Get all known role IDs. */
export function getAllRoleIds(): string[] {
  return Object.keys(PILLAR_MAP)
}
