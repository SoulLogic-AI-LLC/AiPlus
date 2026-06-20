import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"
import { Authorization } from "../middleware/authorization"

// ===== Response Schemas =====

/** Role status in lobby. */
const RoleStatus = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  pillar: Schema.Literals(["coordinator", "verifier", "expert"]),
  status: Schema.Literals(["active", "idle", "stale"]),
  sessionId: Schema.optional(Schema.String),
  lastActive: Schema.optional(Schema.String),
})

/** Lane status (CEO-1/2/3). */
const LaneStatus = Schema.Struct({
  lane: Schema.String,
  status: Schema.Literals(["active", "idle"]),
  sessionId: Schema.optional(Schema.String),
  role: Schema.optional(Schema.String),
  lastActive: Schema.optional(Schema.String),
})

/** Lobby state. */
const LobbyState = Schema.Struct({
  boundRole: Schema.NullOr(Schema.String),
  boundAt: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
})

/** Lobby status response. */
const LobbyStatusResponse = Schema.Struct({
  roles: Schema.Array(RoleStatus),
  lanes: Schema.Array(LaneStatus),
  state: LobbyState,
})

/** Dispatch entry. */
const DispatchEntry = Schema.Struct({
  dispatchId: Schema.String,
  sessionId: Schema.String,
  role: Schema.String,
  lane: Schema.optional(Schema.String),
  tier: Schema.optional(Schema.Literals(["LIGHT", "MEDIUM", "HEAVY"])),
  outcome: Schema.optional(Schema.Literals(["success", "failed", "canceled"])),
  timestamp: Schema.String,
  task: Schema.optional(Schema.String),
  reversibility: Schema.optional(Schema.String),
  schemaVersion: Schema.optional(Schema.String),
})

/** Token count. */
const TokenCount = Schema.Struct({
  used: Schema.Number,
  total: Schema.Number,
})

/** Context capsule (compact pressure). */
const ContextCapsule = Schema.Struct({
  sessionId: Schema.String,
  contextUsage: Schema.Number,
  pressureLevel: Schema.Literals(["silent", "soft", "hard", "emergency"]),
  tokenCount: TokenCount,
  model: Schema.String,
  writtenAt: Schema.String,
  recommendation: Schema.String,
})

/** Compact thresholds per model. */
const CompactThresholds = Schema.Struct({
  soft: Schema.Number,
  hard: Schema.Number,
  emergency: Schema.Number,
})

/** Context capsule with thresholds. */
const ContextCapsuleWithThresholds = Schema.Struct({
  capsule: Schema.NullOr(ContextCapsule),
  thresholds: Schema.Record(Schema.String, CompactThresholds),
})

/** Permission rule (matches YAML frontmatter format). */
const PermissionRule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: Schema.Literals(["allow", "deny"]),
})

/** Persona info. */
const PersonaInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  pillar: Schema.Literals(["coordinator", "verifier", "expert"]),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  hidden: Schema.Boolean,
  permissions: Schema.Array(PermissionRule),
})

// ===== Paths =====

const root = "/aiplus"

export const AiplusPaths = {
  lobbyStatus: `${root}/lobby/status`,
  dispatchGet: `${root}/dispatch/:sessionId`,
  dispatchList: `${root}/dispatch/list`,
  capsuleGet: `${root}/compact/capsule`,
  personasList: `${root}/personas`,
} as const

// ===== Params =====

export const SessionIdParam = Schema.Struct({
  sessionId: Schema.String,
})

// ===== API Group =====

export const AiplusApi = HttpApi.make("aiplus").add(
  HttpApiGroup.make("aiplus")
    .add(
      HttpApiEndpoint.get("lobbyStatus", AiplusPaths.lobbyStatus, {
        success: described(LobbyStatusResponse, "Lobby status with roles, lanes, and state"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "aiplus.lobbyStatus",
          summary: "Get lobby status",
          description: "Retrieve lobby status including pillar-grouped roles, CEO lane status, and bound state.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("dispatchGet", AiplusPaths.dispatchGet, {
        params: SessionIdParam,
        success: described(DispatchEntry, "Dispatch entry for session"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "aiplus.dispatchGet",
          summary: "Get dispatch entry",
          description: "Retrieve the dispatch log entry for a specific session.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("dispatchList", AiplusPaths.dispatchList, {
        success: described(Schema.Array(DispatchEntry), "All dispatch entries"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "aiplus.dispatchList",
          summary: "List all dispatch entries",
          description: "Retrieve all dispatch log entries.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("capsuleGet", AiplusPaths.capsuleGet, {
        success: described(ContextCapsuleWithThresholds, "Context capsule with per-model thresholds"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "aiplus.capsuleGet",
          summary: "Get compact capsule",
          description: "Retrieve the current context pressure capsule with per-model thresholds.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("personasList", AiplusPaths.personasList, {
        success: described(Schema.Array(PersonaInfo), "List of all personas"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "aiplus.personasList",
          summary: "List personas",
          description: "Retrieve all AiPlus Agent Team personas with their permissions.",
        }),
      ),
    )
    .middleware(Authorization)
    .annotateMerge(OpenApi.annotations({ title: "aiplus", description: "AiPlus Agent Team routes." })),
)
