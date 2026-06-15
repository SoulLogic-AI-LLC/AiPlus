import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@opencode-ai/core/global"
import path from "path"
import fs from "node:fs"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@opencode-ai/core/schema"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { Reference } from "@opencode-ai/core/reference"
import { Location } from "@opencode-ai/core/location"
import { TEAM } from "../../../../aiplus/team/manifest"
import { PERSONA_ASSETS } from "../../../../aiplus/gen/persona-assets"
import { readState as readLobbyState } from "../../../../aiplus/lobby/state"
import { getLaneStatuses } from "../../../../aiplus/lobby/leases"
import { registerDisposer } from "@/effect/instance-registry"
import matter from "gray-matter"

// Track active CEO lease IDs per directory for cleanup on shutdown
const activeCEOLeaseIds = new Map<string, Map<string, string>>() // directory → (lane → leaseId)

// Register disposer: clean up CEO leases when instance shuts down
registerDisposer(async (directory: string) => {
  const leases = activeCEOLeaseIds.get(directory)
  if (!leases || leases.size === 0) return
  try {
    const leasePath = path.join(directory, ".aiplus/worktree/leases.json")
    if (!fs.existsSync(leasePath)) return
    const data = JSON.parse(fs.readFileSync(leasePath, "utf-8"))
    const leaseIdSet = new Set(leases.values())
    data.leases = (data.leases ?? []).filter(
      (l: { leaseId?: string }) => !l.leaseId || !leaseIdSet.has(l.leaseId),
    )
    fs.writeFileSync(leasePath, JSON.stringify(data, null, 2))
    activeCEOLeaseIds.delete(directory)
  } catch {
    // cleanup failure is non-fatal
  }
})

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = yield* Effect.gen(function* () {
          yield* (yield* PluginBoot.Service).wait()
          return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          build: {
            name: "build",
            description: "The default agent. Executes tools based on configured permissions.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
            hidden: true,
          },
          plan: {
            name: "plan",
            description: "Plan mode. Disallows all edit tools.",
            options: {},
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".opencode", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
            hidden: true,
          },
          general: {
            name: "general",
            description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        // Register persona agents from native team manifest
        for (const spec of TEAM) {
          if (agents[spec.persona]) continue
          const personaContent = PERSONA_ASSETS[`${spec.slug}.md`]
          const prompt = personaContent ? matter(personaContent).content.trim() : undefined
          agents[spec.persona] = {
            name: spec.persona,
            description: spec.description,
            mode: "primary",
            options: {},
            permission: Permission.merge(defaults, user),
            native: false,
            prompt,
          }
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const resolveAgentName = (raw: string): string | undefined => {
          if (raw.startsWith("agent-team-")) {
            const slug = raw.slice("agent-team-".length)
            const spec = TEAM.find((r) => r.slug === slug)
            return spec?.persona
          }
          return raw
        }

        // CEO lane helpers — fixed 3-slot model
        const CEO_LANE_SLOTS = [
          { name: "CEO-1", lane: "ceo-1" },
          { name: "CEO-2", lane: "ceo-2" },
          { name: "CEO-3", lane: "ceo-3" },
        ]

        function getOccupiedCEOLanes(): Set<string> {
          try {
            const statuses = getLaneStatuses(ctx.directory)
            return new Set(statuses.filter((l) => l.status === "active").map((l) => l.lane))
          } catch {
            return new Set()
          }
        }

        function ceoAgentInfo(name: string): Info | undefined {
          const ceoBase = agents["CEO"]
          if (!ceoBase) return undefined
          return { ...ceoBase, name }
        }

        function buildCEOLaneAgents(): Info[] {
          const occupied = getOccupiedCEOLanes()
          return CEO_LANE_SLOTS.map((slot) => {
            const base = ceoAgentInfo(slot.name)
            if (!base) return null
            const isOccupied = occupied.has(slot.lane)
            return {
              ...base,
              name: slot.name,
              description: isOccupied
                ? `${base.description || "AiPlus execution coordinator"} — currently in use`
                : base.description || "AiPlus execution coordinator",
            }
          }).filter(Boolean) as Info[]
        }

        function resolveCEOLane(name: string): string | undefined {
          const match = CEO_LANE_SLOTS.find((c) => c.name === name)
          if (!match) return undefined
          return match.lane
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          const resolved = resolveAgentName(agent) ?? agent
          const ceoLane = resolveCEOLane(resolved)
          if (ceoLane !== undefined) {
            const occupied = getOccupiedCEOLanes()
            if (occupied.has(ceoLane)) {
              // Lane occupied — return undefined (TUI shows "Agent not found")
              return agents["__nonexistent__"]
            }
            process.env.AIPLUS_LOBBY_CEO_LANE = ceoLane
            try {
              const leasePath = path.join(ctx.directory, ".aiplus/worktree/leases.json")
              const existing = fs.existsSync(leasePath)
                ? JSON.parse(fs.readFileSync(leasePath, "utf-8"))
                : { leases: [] }
              const now = Date.now()
              const STALE_MS = 24 * 60 * 60 * 1000
              existing.leases = (existing.leases ?? []).filter(
                (l: { acquiredAt?: string; expiresAt?: string }) => {
                  if (!l.acquiredAt) return false
                  return now - new Date(l.acquiredAt).getTime() <= STALE_MS
                },
              )
              const hasActive = existing.leases.some(
                (l: { lane?: string; expiresAt?: string }) =>
                  l.lane === ceoLane && l.expiresAt && new Date(l.expiresAt).getTime() > now,
              )
              if (!hasActive) {
                const leaseId = `lease-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                existing.leases.push({
                  leaseId,
                  sessionId: `pending-${Date.now()}`,
                  lane: ceoLane,
                  status: "active",
                  acquiredAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + STALE_MS).toISOString(),
                })
                fs.mkdirSync(path.dirname(leasePath), { recursive: true })
                fs.writeFileSync(leasePath, JSON.stringify(existing, null, 2))
                let dirLeases = activeCEOLeaseIds.get(ctx.directory)
                if (!dirLeases) {
                  dirLeases = new Map()
                  activeCEOLeaseIds.set(ctx.directory, dirLeases)
                }
                dirLeases.set(ceoLane, leaseId)
              }
            } catch {
              // lease write failure is non-fatal
            }
            return agents["CEO"]
          }
          return agents[resolved]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          // Filter out base "CEO" from agents — we add CEO lane agents dynamically
          const baseAgents = pipe(
            agents,
            values(),
            (items) => items.filter((a) => a.name !== "CEO"),
          )
          // Add CEO lane agents based on current lease occupancy
          const ceoAgents = buildCEOLaneAgents()
          const allAgents = [...baseAgents, ...ceoAgents]
          return sortBy(
            allAgents,
            [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
            [(x) => x.name, "asc"],
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(LocationServiceMap.layer),
)

const locationServiceMapNode = LayerNode.make(LocationServiceMap.layer, [])

export const node = LayerNode.make(layer, [
  Config.node,
  Auth.node,
  Plugin.node,
  Skill.node,
  Provider.node,
  locationServiceMapNode,
])

export * as Agent from "./agent"
