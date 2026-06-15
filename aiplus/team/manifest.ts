// Native team manifest — replaces Rust source crates/aiplus-core/src/module_manifest.rs
// Single source of truth for subagent type registration.
//
// Usage: import { TEAM, bySlug, byPersona } from "./manifest"

export interface RoleSpec {
  /** URL-style slug used in subagent prefix: "agent-team-{slug}" */
  slug: string
  /** Matches the YAML `name:` field in aiplus/agents/{slug}.md */
  persona: string
  category: "core" | "expert" | "bench"
  /** Short description for Task tool dispatch guidance */
  description: string
}

export const TEAM: RoleSpec[] = [
  // ── Core (12) ──────────────────────────────────────────────────────
  {
    slug: "advisor",
    persona: "Advisor",
    category: "core",
    description:
      "Frames decisions, challenges premises, distinguishes reversible from irreversible choices",
  },
  {
    slug: "ceo",
    persona: "CEO",
    category: "core",
    description:
      "Owns task scoping, role staffing, sequencing, and status reporting",
  },
  {
    slug: "architect",
    persona: "Architect",
    category: "core",
    description:
      "Data flow, coupling, failure modes, long-term reversibility",
  },
  {
    slug: "pm",
    persona: "PM",
    category: "core",
    description: "Scope cuts, acceptance criteria, definition of done",
  },
  {
    slug: "ui-designer",
    persona: "UI Designer",
    category: "core",
    description:
      "User paths, interaction flow, states, recovery, usability, design consistency",
  },
  {
    slug: "ai-integration",
    persona: "AI Integration",
    category: "core",
    description:
      "LLM workflows, prompts, model choice, tool calling, evals, fallbacks, cost, latency, and AI failure modes",
  },
  {
    slug: "engineer-a",
    persona: "Engineer A",
    category: "core",
    description:
      "Primary implementation specialist — writes code, tests, and clean branches against explicit acceptance criteria",
  },
  {
    slug: "engineer-b",
    persona: "Engineer B",
    category: "core",
    description:
      "Secondary implementation specialist — parallel builder with strict file-ownership boundaries",
  },
  {
    slug: "integration-manager",
    persona: "Integration Manager",
    category: "core",
    description:
      "Neutral lane integration coordinator — discovers, dry-run checks, plans merge order",
  },
  {
    slug: "reviewer",
    persona: "Reviewer",
    category: "core",
    description:
      "Adversarial verification, judges diffs against acceptance criteria with PASS/REVISE/BLOCKED verdicts",
  },
  {
    slug: "security-reviewer",
    persona: "Security Reviewer",
    category: "core",
    description:
      "Secrets, auth, privacy, billing, user data, automation side effects",
  },
  {
    slug: "qa",
    persona: "QA",
    category: "core",
    description:
      "Behavior validator, runs reproducible tests, reports per-criterion PASS/FAIL with exact commands and observed output",
  },

  // ── Expert (8) ─────────────────────────────────────────────────────
  {
    slug: "tech-writer",
    persona: "Tech Writer",
    category: "expert",
    description:
      "README, docs, error messages, onboarding flow, every sentence is a UI",
  },
  {
    slug: "devops",
    persona: "DevOps",
    category: "expert",
    description:
      "CI/CD, deploy, rollback, monitoring, SLOs, on-call ergonomics",
  },
  {
    slug: "researcher",
    persona: "Researcher",
    category: "expert",
    description:
      "Best-practice hunter, benchmark methodology checker, dissenting-opinion reader",
  },
  {
    slug: "performance-engineer",
    persona: "Performance Engineer",
    category: "expert",
    description:
      "Profiling, benchmarking, latency/throughput optimization, resource usage, bottleneck identification",
  },
  {
    slug: "cqo",
    persona: "CQO",
    category: "expert",
    description:
      "Quality-chain judge, cross-verifies AC/implementation/reviewer findings",
  },
  {
    slug: "performance-auditor",
    persona: "Performance Auditor",
    category: "expert",
    description:
      "Runs aiplus velocity data, cross-analyzes agent performance, produces quantitative reports",
  },

  // ── Bench (3) ──────────────────────────────────────────────────────
  {
    slug: "release-manager",
    persona: "Release Manager",
    category: "bench",
    description:
      "Verifies PR status, CI/checks, release checklist, tag/release/smoke/assets",
  },
  {
    slug: "evidence-auditor",
    persona: "Evidence Auditor",
    category: "bench",
    description:
      "Compares CEO/worker claims against git diff, CI, artifacts, dogfood transcripts",
  },
  {
    slug: "chief-auditor",
    persona: "Chief Auditor",
    category: "bench",
    description:
      "Read-only verification coordinator, plans independent verification fan-out and gate evidence checks",
  },
]

/** Look up a role by slug (e.g. "advisor") */
export function bySlug(slug: string): RoleSpec | undefined {
  return TEAM.find((r) => r.slug === slug)
}

/** Look up a role by persona name (e.g. "Advisor") */
export function byPersona(persona: string): RoleSpec | undefined {
  return TEAM.find((r) => r.persona === persona)
}

/** Subagent prefix used by the Rust runtime */
export const SUBAGENT_PREFIX = "agent-team-"

/** Full subagent type name for a given slug */
export function subagentType(slug: string): string {
  return `${SUBAGENT_PREFIX}${slug}`
}
