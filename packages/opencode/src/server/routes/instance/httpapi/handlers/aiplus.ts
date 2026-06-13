import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import * as fs from "node:fs"
import * as path from "node:path"
import { COMPACT_THRESHOLDS } from "../../../../../../../../aiplus/compact/thresholds"

// ===== File Read Utilities =====

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function readJsonlFile<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(l => l.trim())
    return lines.map(l => JSON.parse(l) as T)
  } catch {
    return []
  }
}

// ===== Data Types =====

interface RoleStatus {
  id: string
  name: string
  pillar: "coordinator" | "verifier" | "expert"
  status: "active" | "idle" | "stale"
  sessionId?: string
  lastActive?: string
}

interface LaneStatus {
  lane: string
  status: "active" | "idle"
  sessionId?: string
  role?: string
  lastActive?: string
}

interface LobbyState {
  boundRole: string | null
  boundAt: string | null
  sessionId: string | null
}

interface DispatchEntry {
  dispatchId: string
  sessionId?: string
  role: string
  tier?: string
  outcome?: string
  timestamp: string
  task?: string
  reversibility?: string
  schemaVersion?: string
}

interface ContextCapsule {
  sessionId: string
  contextUsage: number
  pressureLevel: string
  tokenCount: { used: number; total: number }
  model: string
  writtenAt: string
  recommendation: string
}

interface MemoryEntry {
  sessionId: string
  role: string
  startedAt: string
  endedAt: string
  task: string
  outcome: string
}

// ===== Pillar Mapping =====

const PILLAR_MAP: Record<string, "coordinator" | "verifier" | "expert"> = {
  "ceo": "coordinator",
  "advisor": "coordinator",
  "pm": "coordinator",
  "architect": "coordinator",
  "reviewer": "verifier",
  "qa": "verifier",
  "security-reviewer": "verifier",
  "chief-auditor": "verifier",
  "evidence-auditor": "verifier",
  "release-manager": "verifier",
  "cqo": "verifier",
  "performance-auditor": "verifier",
  "engineer-a": "expert",
  "engineer-b": "expert",
  "devops": "expert",
  "tech-writer": "expert",
  "researcher": "expert",
  "ai-integration": "expert",
  "integration-manager": "expert",
  "ui-designer": "expert",
}

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

// ===== Handler =====

export const aiplusHandlers = HttpApiBuilder.group(InstanceHttpApi, "aiplus", (handlers) =>
  Effect.gen(function* () {
    const projectRoot = process.cwd()

    // GET /aiplus/lobby/status
    const lobbyStatus = Effect.fn("AiplusHttpApi.lobbyStatus")(function* () {
      const dispatchLogPath = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
      const memoryDir = path.join(projectRoot, ".aiplus", "agent-memory")
      const lobbyStatePath = path.join(projectRoot, ".aiplus", "lobby", "lobby-state.json")
      const leasesPath = path.join(projectRoot, ".aiplus", "worktree", "leases.json")

      // Read dispatch entries
      const dispatchEntries = readJsonlFile<DispatchEntry>(dispatchLogPath)
      const recentEntries = dispatchEntries.filter(e => {
        const age = Date.now() - new Date(e.timestamp).getTime()
        return age < 24 * 60 * 60 * 1000 // 24h
      })

      // Build role statuses
      const roles: RoleStatus[] = Object.keys(PILLAR_MAP).map(roleId => {
        const latest = dispatchEntries
          .filter(e => e.role === roleId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

        let status: "active" | "idle" | "stale" = "idle"
        if (latest) {
          const isRecent = recentEntries.some(e => e.dispatchId === latest.dispatchId)
          if (isRecent && latest.outcome !== "failed" && latest.outcome !== "canceled") {
            status = "active"
          } else if (!isRecent) {
            status = "stale"
          }
        }

        return {
          id: roleId,
          name: DISPLAY_NAMES[roleId] ?? roleId,
          pillar: PILLAR_MAP[roleId],
          status,
          sessionId: latest ? latest.sessionId : undefined,
          lastActive: latest?.timestamp,
        }
      })

      // Read lease statuses
      const leasesData = readJsonFile<{ leases?: Array<{ lane: string; status: string; sessionId: string; acquiredAt: string; expiresAt: string }> }>(leasesPath)
      const leases = leasesData?.leases ?? []
      const lanes: LaneStatus[] = ["ceo-1", "ceo-2", "ceo-3"].map(lane => {
        const lease = leases.find(l => l.lane === lane && l.status === "active")
        const isExpired = lease ? new Date(lease.expiresAt).getTime() < Date.now() : true
        const isStale = lease ? Date.now() - new Date(lease.acquiredAt).getTime() > 24 * 60 * 60 * 1000 : false

        if (lease && !isExpired && !isStale) {
          return {
            lane,
            status: "active" as const,
            sessionId: lease.sessionId,
            role: lane,
            lastActive: lease.acquiredAt,
          }
        }
        return { lane, status: "idle" as const }
      })

      // Read lobby state
      const state = readJsonFile<LobbyState>(lobbyStatePath) ?? {
        boundRole: null,
        boundAt: null,
        sessionId: null,
      }

      return { roles, lanes, state }
    })

    // GET /aiplus/dispatch/:sessionId
    const dispatchGet = Effect.fn("AiplusHttpApi.dispatchGet")(function* (ctx: { params: { sessionId: string } }) {
      const dispatchLogPath = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
      const entries = readJsonlFile<DispatchEntry>(dispatchLogPath)

      // Find by sessionId (extracted from dispatchId or direct match)
      const entry = entries.find(e => {
        const match = e.dispatchId.match(/^dispatch-(\d+)-/)
        const extractedId = e.sessionId ?? (match ? `session-${match[1]}` : e.dispatchId)
        return extractedId === ctx.params.sessionId || e.dispatchId === ctx.params.sessionId
      })

      if (!entry) {
        return yield* new HttpApiError.NotFound({})
      }

      // Extract sessionId from dispatchId if not present
      const match = entry.dispatchId.match(/^dispatch-(\d+)-/)
      const sessionId = entry.sessionId ?? (match ? `session-${match[1]}` : entry.dispatchId)

      return {
        ...entry,
        sessionId,
      }
    })

    // GET /aiplus/dispatch/list
    const dispatchList = Effect.fn("AiplusHttpApi.dispatchList")(function* () {
      const dispatchLogPath = path.join(projectRoot, ".aiplus", "agents", "dispatch-log.jsonl")
      const entries = readJsonlFile<DispatchEntry>(dispatchLogPath)

      // Extract sessionId from dispatchId if not present
      return entries.map(e => {
        const match = e.dispatchId.match(/^dispatch-(\d+)-/)
        const sessionId = e.sessionId ?? (match ? `session-${match[1]}` : e.dispatchId)
        return { ...e, sessionId }
      })
    })

    // GET /aiplus/compact/capsule
    const capsuleGet = Effect.fn("AiplusHttpApi.capsuleGet")(function* () {
      const capsulePath = path.join(projectRoot, ".aiplus", "compact", "context-capsule.json")
      const capsule = readJsonFile<ContextCapsule>(capsulePath)
      return {
        capsule: capsule ?? null,
        thresholds: COMPACT_THRESHOLDS,
      }
    })

    // GET /aiplus/personas
    const personasList = Effect.fn("AiplusHttpApi.personasList")(function* () {
      const agentsDir = path.join(projectRoot, "aiplus", "agents")
      if (!fs.existsSync(agentsDir)) {
        return []
      }

      const personas = []
      for (const file of fs.readdirSync(agentsDir)) {
        if (!file.endsWith(".md")) continue
        const content = fs.readFileSync(path.join(agentsDir, file), "utf-8")

        // Parse YAML frontmatter
        const match = content.match(/^---\n([\s\S]*?)\n---/)
        if (!match) continue

        const frontmatter = match[1]
        const id = file.replace(".md", "")

        // Extract fields from YAML
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
        const modeMatch = frontmatter.match(/^mode:\s*(.+)$/m)
        const hiddenMatch = frontmatter.match(/^hidden:\s*(.+)$/m)

        // Parse permissions (YAML format: permission/pattern/action)
        const permissions: Array<{ permission: string; pattern: string; action: "allow" | "deny" }> = []
        const permLines = frontmatter.split("\n")
        let inPerm = false
        let currentPerm: { permission?: string; pattern?: string; action?: "allow" | "deny" } = {}
        for (const line of permLines) {
          if (line.trim().startsWith("- permission:")) {
            // Save previous entry if complete
            if (currentPerm.permission && currentPerm.pattern && currentPerm.action) {
              permissions.push(currentPerm as { permission: string; pattern: string; action: "allow" | "deny" })
            }
            inPerm = true
            currentPerm = {}
            const permMatch = line.match(/permission:\s*"?([^"]+)"?/)
            if (permMatch) currentPerm.permission = permMatch[1]
            continue
          }
          if (inPerm) {
            const patternMatch = line.match(/pattern:\s*"?([^"]+)"?/)
            const actionMatch = line.match(/action:\s*"?(\w+)"?/)
            if (patternMatch) currentPerm.pattern = patternMatch[1]
            if (actionMatch) currentPerm.action = actionMatch[1] as "allow" | "deny"
          }
        }
        // Save last entry
        if (currentPerm.permission && currentPerm.pattern && currentPerm.action) {
          permissions.push(currentPerm as { permission: string; pattern: string; action: "allow" | "deny" })
        }

        personas.push({
          id,
          name: nameMatch?.[1]?.trim() ?? id,
          description: descMatch?.[1]?.trim() ?? "",
          pillar: PILLAR_MAP[id] ?? "expert",
          mode: (modeMatch?.[1]?.trim() as "subagent" | "primary" | "all") ?? "subagent",
          hidden: hiddenMatch?.[1]?.trim() === "true",
          permissions,
        })
      }

      return personas
    })

    return handlers
      .handle("lobbyStatus", () => lobbyStatus())
      .handle("dispatchGet", (ctx) => dispatchGet(ctx))
      .handle("dispatchList", () => dispatchList())
      .handle("capsuleGet", () => capsuleGet())
      .handle("personasList", () => personasList())
  }),
)
