import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { ToolJsonSchema } from "./json-schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Effect, Exit, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { Database } from "@opencode-ai/core/database/database"
import os from "os"
import { appendPerformanceStart, appendPerformanceComplete } from "../../../../aiplus/agent-performance/record"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<SessionV1.WithParts>
}

const id = "task"
const BACKGROUND_DESCRIPTION = [
  "Background mode: background=true launches the subagent asynchronously and returns immediately.",
  "Foreground is the default; use it when you need the result before continuing.",
  "Use background only for independent work that can run while you continue elsewhere.",
  "You will be notified automatically when it finishes.",
].join(" ")
const BACKGROUND_STARTED = [
  "The task is working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
].join("\n")
const BACKGROUND_UPDATED = [
  "Additional context sent to the running background task.",
  "The task is still working in the background. You will be notified automatically when it finishes.",
  "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.",
  "Work on non-overlapping tasks, or briefly tell the user what you sent and end your response.",
].join("\n")

const SUBAGENT_MEMORY_GB = 0.50
const SUBAGENT_SOFT_RESERVE_GB = 1.5
const SUBAGENT_HARD_FLOOR_GB = 0.25
const activeSubagentSlots = new Set<string>()

function currentFreeMemoryGb() {
  return os.freemem() / (1024 * 1024 * 1024)
}

function subagentCapacity(freeGb: number) {
  // Hard floor: no sub-agents below 0.25GB — system stability at risk
  if (freeGb < SUBAGENT_HARD_FLOOR_GB) return 0
  // Low memory: allow exactly 1 sub-agent between 0.25GB and 1.5GB
  if (freeGb < SUBAGENT_SOFT_RESERVE_GB) return 1
  // Normal: capacity scales with available memory above the hard floor (ceil = don't waste partial slots)
  return Math.max(1, Math.ceil(((freeGb - SUBAGENT_HARD_FLOOR_GB) / SUBAGENT_MEMORY_GB) - 1e-9))
}

function reserveSubagentSlot() {
  const freeGb = currentFreeMemoryGb()
  if (freeGb < SUBAGENT_HARD_FLOOR_GB) {
    return {
      ok: false as const,
      message: `Free memory is only ${freeGb.toFixed(2)}GB, below the hard floor of ${SUBAGENT_HARD_FLOOR_GB.toFixed(2)}GB. Starting a new subagent is blocked.`,
    }
  }
  if (freeGb < SUBAGENT_SOFT_RESERVE_GB) {
    const capacity = subagentCapacity(freeGb)
    const active = activeSubagentSlots.size
    if (active >= capacity) {
      return {
        ok: false as const,
        message: `Memory is tight (${freeGb.toFixed(2)}GB free, below ${SUBAGENT_SOFT_RESERVE_GB.toFixed(2)}GB reserve). Only 1 sub-agent slot available and it is currently in use.`,
      }
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    activeSubagentSlots.add(token)
    return { ok: true as const, token }
  }
  const capacity = subagentCapacity(freeGb)
  const active = activeSubagentSlots.size
  if (active >= capacity) {
    return {
      ok: false as const,
      message: `Subagent capacity reached (${active} active >= ${capacity} allowed). free_gb=${freeGb.toFixed(2)} reserve_gb=${SUBAGENT_SOFT_RESERVE_GB.toFixed(2)} per_agent_gb=${SUBAGENT_MEMORY_GB.toFixed(2)}.`,
    }
  }
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  activeSubagentSlots.add(token)
  return { ok: true as const, token }
}

function releaseSubagentSlot(token: string) {
  activeSubagentSlots.delete(token)
}

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  model: Schema.optional(Schema.String).annotate({
    description:
      "Override the model for this task. Valid values: deepseek-v4-pro, deepseek-v4-flash, deepseek-chat, minimax-m3, minimax-m2.7, mimo-v2.5, mimo-v2.5-pro, kimi-k2.7-code, kimi-k2.6, glm-5.1, glm-5, qwen3.7-max, qwen3.7-plus, qwen3.6-plus, gemini-2.5-flash, gemini-2.5-flash-direct, gemini-2.0-flash, llama-4-maverick, llama-3.3-70b, groq-llama-3.3-70b, mistral-small, openrouter-deepseek-v3, openrouter-qwen-coder-32b, openrouter-llama-3.3-70b, openrouter-auto. If not specified, uses the agent default or parent model.",
  }),
  effort: Schema.optional(Schema.String).annotate({
    description: "Task complexity/effort level (low, medium, high). Maps to model variants (e.g., thinking mode for high effort).",
  }),
}

const BaseParameters = Schema.Struct(BaseParameterFields)

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description:
      "Run the agent in the background. You will be notified when it completes. DO NOT sleep, poll, or proactively check on its progress",
  }),
})

function renderOutput(input: {
  sessionID: SessionID
  state: "running" | "completed" | "error"
  summary?: string
  text: string
}) {
  const tag = input.state === "error" ? "task_error" : "task_result"
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
    ...(input.summary ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}>`,
    input.text,
    `</${tag}>`,
    "</task>",
  ].join("\n")
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      const instanceCtx = yield* InstanceState.context
      const runInBackground = params.background === true
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(
          new Error("Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"),
        )
      }

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      const session = params.task_id
        ? yield* sessions.get(SessionID.make(params.task_id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const parent = yield* sessions.get(ctx.sessionID)
      const childPermission = deriveSubagentSessionPermission({
        parentSessionPermission: parent.permission ?? [],
        subagent: next,
      })
      const childToolDenies = [
        ...(next.permission.some((rule) => rule.permission === "todowrite")
          ? []
          : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
        ...(next.permission.some((rule) => rule.permission === id)
          ? []
          : [{ permission: id, pattern: "*" as const, action: "deny" as const }]),
        ...(cfg.experimental?.primary_tools?.map((permission) => ({
          permission,
          pattern: "*" as const,
          action: "deny" as const,
        })) ?? []),
      ]
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
          agent: next.name,
          permission: [
            ...childPermission,
            ...childToolDenies.filter(
              (deny) =>
                !childPermission.some(
                  (rule) =>
                    rule.permission === deny.permission && rule.pattern === deny.pattern && rule.action === deny.action,
                ),
            ),
          ],
        }))

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(
        Effect.provideService(Database.Service, database),
        Effect.orDie,
      )
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
      const variant = msg.info.variant

      // CEO-specified model overrides agent default and parent inheritance
      // Each model maps to its native provider (NOT msg.info.providerID) to support
      // cross-provider dispatch: a CA session on MiniMax can dispatch a subagent on
      // DeepSeek without looking for DeepSeek models on the MiniMax provider.
      const MODEL_MAP: Record<string, { modelID: typeof msg.info.modelID; providerID: typeof msg.info.providerID }> = {
        "deepseek-v4-pro": { modelID: "deepseek-v4-pro" as typeof msg.info.modelID, providerID: "deepseek" as typeof msg.info.providerID },
        "deepseek-v4-flash": { modelID: "deepseek-v4-flash" as typeof msg.info.modelID, providerID: "deepseek" as typeof msg.info.providerID },
        "deepseek-chat": { modelID: "deepseek-chat" as typeof msg.info.modelID, providerID: "deepseek" as typeof msg.info.providerID },
        "minimax-m3": { modelID: "minimax-m3" as typeof msg.info.modelID, providerID: "minimax-coding-plan" as typeof msg.info.providerID },
        "minimax-m2.7": { modelID: "minimax-m2.7" as typeof msg.info.modelID, providerID: "minimax-coding-plan" as typeof msg.info.providerID },
        "mimo-v2.5": { modelID: "mimo-v2.5" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "mimo-v2.5-pro": { modelID: "mimo-v2.5-pro" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "kimi-k2.7-code": { modelID: "kimi-k2.7-code" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "kimi-k2.6": { modelID: "kimi-k2.6" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "glm-5.1": { modelID: "glm-5.1" as typeof msg.info.modelID, providerID: "zai-coding-plan" as typeof msg.info.providerID },
        "glm-5": { modelID: "glm-5" as typeof msg.info.modelID, providerID: "zai-coding-plan" as typeof msg.info.providerID },
        "qwen3.7-max": { modelID: "qwen3.7-max" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "qwen3.7-plus": { modelID: "qwen3.7-plus" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "qwen3.6-plus": { modelID: "qwen3.6-plus" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "gemini-2.5-flash-direct": { modelID: "gemini-2.5-flash" as typeof msg.info.modelID, providerID: "google" as typeof msg.info.providerID },
        "gemini-3.5-flash-direct": { modelID: "gemini-3.5-flash" as typeof msg.info.modelID, providerID: "google" as typeof msg.info.providerID },
        "groq-llama-3.3-70b": { modelID: "llama-3.3-70b-versatile" as typeof msg.info.modelID, providerID: "groq" as typeof msg.info.providerID },
        "openrouter-deepseek-v3": { modelID: "deepseek/deepseek-chat-v3" as typeof msg.info.modelID, providerID: "openrouter" as typeof msg.info.providerID },
        "openrouter-qwen-coder-32b": { modelID: "qwen/qwen-2.5-coder-32b-instruct" as typeof msg.info.modelID, providerID: "openrouter" as typeof msg.info.providerID },
        "openrouter-llama-3.3-70b": { modelID: "meta-llama/llama-3.3-70b-instruct" as typeof msg.info.modelID, providerID: "openrouter" as typeof msg.info.providerID },
        "openrouter-auto": { modelID: "openrouter/auto" as typeof msg.info.modelID, providerID: "openrouter" as typeof msg.info.providerID },
        // Free models (zero cost, always available)
        "gemini-2.5-flash": { modelID: "gemini-2.5-flash" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "gemini-2.0-flash": { modelID: "gemini-2.0-flash" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "llama-4-maverick": { modelID: "llama-4-maverick" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "llama-3.3-70b": { modelID: "llama-3.3-70b" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
        "mistral-small": { modelID: "mistral-small" as typeof msg.info.modelID, providerID: "opencode-go" as typeof msg.info.providerID },
      }
      if (params.model === "gpt-5.4") {
        yield* ctx.ask({
          permission: id,
          patterns: ["gpt-5.4"],
          always: ["*"],
          metadata: {
            description: `GPT-5.4 requires owner approval: ${params.description}`,
            model: params.model,
          },
        })
      }
      const model = params.model
        ? MODEL_MAP[params.model] ?? { modelID: params.model as typeof msg.info.modelID, providerID: msg.info.providerID }
        : next.model ?? { modelID: msg.info.modelID, providerID: msg.info.providerID }
      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        effort: params.effort,
        ...(runInBackground ? { background: true } : {}),
      }

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      // AMTP: record performance start
      const taskStartTime = Date.now()
      yield* Effect.sync(() =>
        appendPerformanceStart({
          projectRoot: instanceCtx.directory,
          sessionId: nextSession.id,
          role: next.name,
          agentName: next.name,
          modelId: model.modelID,
          providerID: model.providerID,
          taskType: params.description.split(":")[0]?.trim().split(" ")[0]?.toLowerCase() ?? "other",
          taskSummary: params.description,
          estimatedMs: null,
        }),
      )

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))
      const slot = reserveSubagentSlot()
      if (!slot.ok) return yield* Effect.fail(new Error(slot.message))

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
        const parts = yield* ops.resolvePromptParts(params.prompt)
        const result = yield* ops.prompt({
          messageID: MessageID.ascending(),
          sessionID: nextSession.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          variant: next.model ? undefined : variant,
          agent: next.name,
          parts,
        })
        return result.parts.findLast((item) => item.type === "text")?.text ?? ""
      })

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            variant,
            parts: [
              {
                type: "text",
                synthetic: true,
                text: renderOutput({
                  sessionID: nextSession.id,
                  state,
                  summary:
                    state === "completed"
                      ? `Background task completed: ${params.description}`
                      : `Background task failed: ${params.description}`,
                  text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const notify = Effect.fn("TaskTool.notifyBackgroundResult")(function* (jobID: string) {
        yield* background.wait({ id: jobID }).pipe(
          Effect.flatMap((result) => {
            if (result.info?.status === "completed") return inject("completed", result.info.output ?? "")
            if (result.info?.status === "error") return inject("error", result.info.error ?? "")
            return Effect.void
          }),
          Effect.forkIn(scope, { startImmediately: true }),
        )
      })

      if (yield* background.extend({ id: nextSession.id, run: runTask() })) {
        releaseSubagentSlot(slot.token)
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: nextSession.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task updated",
            text: BACKGROUND_UPDATED,
          }),
        }
      }

      const info = yield* background.start({
        id: nextSession.id,
        type: id,
        title: params.description,
        metadata,
        onPromote: Effect.all([
          ctx.metadata({
            title: params.description,
            metadata: { ...metadata, background: true, jobId: nextSession.id },
          }),
          notify(nextSession.id),
        ]),
        run: runTask().pipe(
          Effect.onInterrupt(() => ops.cancel(nextSession.id)),
          Effect.ensuring(Effect.sync(() => releaseSubagentSlot(slot.token))),
        ),
      })

      function backgroundResult() {
        return {
          title: params.description,
          metadata: {
            ...metadata,
            background: true,
            jobId: info.id,
          },
          output: renderOutput({
            sessionID: nextSession.id,
            state: "running",
            summary: "Background task started",
            text: BACKGROUND_STARTED,
          }),
        }
      }

      if (runInBackground) {
        yield* notify(info.id)
        return backgroundResult()
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            const result = yield* Effect.raceFirst(
              background.wait({ id: nextSession.id }).pipe(Effect.map((waited) => waited.info)),
              background.waitForPromotion(nextSession.id),
            )
            if (result?.metadata?.background === true) return backgroundResult()
            if (result?.status === "error") {
              // AMTP: record failed performance
              yield* Effect.sync(() =>
                appendPerformanceComplete({
                  projectRoot: instanceCtx.directory,
                  sessionId: nextSession.id,
                  actualMs: Date.now() - taskStartTime,
                  tokensIn: 0,
                  tokensOut: 0,
                  costUSD: 0,
                  outcome: "failed",
                  linesChanged: 0,
                  filesChanged: 0,
                }),
              )
              return yield* Effect.fail(new Error(result.error ?? "Task failed"))
            }
            if (result?.status === "cancelled") return yield* Effect.fail(new Error("Task cancelled"))
            // AMTP: record performance complete
            yield* Effect.sync(() =>
              appendPerformanceComplete({
                projectRoot: instanceCtx.directory,
                sessionId: nextSession.id,
                actualMs: Date.now() - taskStartTime,
                tokensIn: 0,
                tokensOut: 0,
                costUSD: 0,
                outcome: "success",
                linesChanged: 0,
                filesChanged: 0,
              }),
            )
            return {
              title: params.description,
              metadata,
              output: renderOutput({ sessionID: nextSession.id, state: "completed", text: result?.output ?? "" }),
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit))
              yield* Effect.all([cancel, background.cancel(nextSession.id)], { discard: true })
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                ctx.abort.removeEventListener("abort", onAbort)
              }),
            ),
          ),
      )
    })

    return {
      description: flags.experimentalBackgroundSubagents
        ? [DESCRIPTION, BACKGROUND_DESCRIPTION].join("\n\n")
        : DESCRIPTION,
      parameters: Parameters,
      jsonSchema: flags.experimentalBackgroundSubagents ? undefined : ToolJsonSchema.fromSchema(BaseParameters),
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
