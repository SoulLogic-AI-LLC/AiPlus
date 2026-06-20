import { describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { createDispatchLifecycleHook, generateDispatchId } from "./lifecycle-hook"
import { readAll } from "./reader"
import { loadExecutionState } from "./execution-state"
import { readCanonicalEvents } from "../canonical-events"

function withTempProject(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-lifecycle-"))
  fs.mkdirSync(path.join(root, ".aiplus", "agents"), { recursive: true })
  return run(root).finally(() => fs.rmSync(root, { recursive: true, force: true }))
}

function verifyHashChain(root: string) {
  const logPath = path.join(root, ".aiplus", "agents", "dispatch-log.jsonl")
  if (!fs.existsSync(logPath)) return
  const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter((l) => l.trim())
  for (let i = 1; i < lines.length; i++) {
    const prev = JSON.parse(lines[i - 1]!)
    const curr = JSON.parse(lines[i]!)
    expect(curr.prev_hash).toBe(prev.entry_hash)
  }
}

describe("lifecycle-hook", () => {
  it("writes created + queued on start", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      const dispatchId = generateDispatchId("engineer-a")
      const result = await hook.onDispatchStart({
        dispatchId,
        role: "engineer-a",
        task: "test task",
        sessionId: "session-1",
      })
      expect(result.logged).toBe(true)
      expect(result.dispatchId).toBe(dispatchId)
      expect(result.timestamp).toBeDefined()

      const log = readAll(root)
      expect(log.length).toBe(1)
      expect(log[0]?.status).toBe("created")
      expect(log[0]?.dispatchId).toBe(dispatchId)
      expect(log[0]?.role).toBe("engineer-a")
      expect(log[0]?.sessionId).toBe("session-1")

      const state = await loadExecutionState(root)
      expect(state.dispatches.length).toBe(1)
      expect(state.dispatches[0]?.status).toBe("queued")
      expect(state.dispatches[0]?.backend).toBe("opencode")
      expect(state.dispatches[0]?.roleInstance).toBe("engineer-a")
      expect(state.roles).toEqual(["engineer-a"])

      const canonical = readCanonicalEvents(root, { eventType: "dispatch.created" })
      expect(canonical.length).toBe(1)
      expect(canonical[0]?.dispatchId).toBe(dispatchId)
    })
  })

  it("writes completed on success", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      const dispatchId = generateDispatchId("engineer-a")
      await hook.onDispatchStart({ dispatchId, role: "engineer-a", task: "test task", sessionId: "session-1" })
      await hook.onDispatchComplete({
        dispatchId,
        role: "engineer-a",
        task: "test task",
        sessionId: "session-1",
        durationMs: 100,
      })

      const log = readAll(root)
      expect(log.length).toBe(2)
      expect(log[1]?.status).toBe("completed")
      expect(log[1]?.durationMs).toBe(100)

      const state = await loadExecutionState(root)
      expect(state.dispatches[0]?.status).toBe("completed")
      expect(state.dispatches[0]?.endedAt).toBeDefined()
      expect(state.dispatches[0]?.updatedAt).toBeDefined()

      verifyHashChain(root)

      const canonical = readCanonicalEvents(root, { eventType: "dispatch.completed" })
      expect(canonical.length).toBe(1)
    })
  })

  it("writes failed + error on failure", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      const dispatchId = generateDispatchId("engineer-a")
      await hook.onDispatchStart({ dispatchId, role: "engineer-a", task: "test task", sessionId: "session-1" })
      await hook.onDispatchFail({
        dispatchId,
        role: "engineer-a",
        task: "test task",
        sessionId: "session-1",
        durationMs: 50,
        error: "boom",
      })

      const log = readAll(root)
      expect(log.length).toBe(2)
      expect(log[1]?.status).toBe("failed")
      expect(log[1]?.error).toBe("boom")
      expect(log[1]?.durationMs).toBe(50)

      const state = await loadExecutionState(root)
      expect(state.dispatches[0]?.status).toBe("failed")
      expect(state.dispatches[0]?.error).toBe("boom")

      verifyHashChain(root)

      const canonical = readCanonicalEvents(root, { eventType: "dispatch.failed" })
      expect(canonical.length).toBe(1)
    })
  })

  it("keeps hash chain intact under concurrency", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => (
          (async () => {
            const dispatchId = generateDispatchId(`role-${i}`)
            await hook.onDispatchStart({
              dispatchId,
              role: `role-${i}`,
              task: "concurrent",
              sessionId: `session-${i}`,
            })
            await hook.onDispatchComplete({
              dispatchId,
              role: `role-${i}`,
              task: "concurrent",
              sessionId: `session-${i}`,
              durationMs: 10,
            })
          })()
        ))
      )

      const log = readAll(root)
      expect(log.length).toBe(20)
      verifyHashChain(root)
    })
  })

  it("does not write coordinator_decision to dispatch log", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      await hook.onDispatchStart({
        dispatchId: generateDispatchId("engineer-a"),
        role: "engineer-a",
        task: "test",
      })
      const logText = fs.readFileSync(path.join(root, ".aiplus", "agents", "dispatch-log.jsonl"), "utf-8")
      expect(logText).not.toContain("coordinator_decision")
    })
  })

  it("uses lane in dispatchId and execution state when provided", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      const dispatchId = generateDispatchId("engineer-a", "ceo-1")
      expect(dispatchId).toContain("ceo-1")
      await hook.onDispatchStart({ dispatchId, role: "engineer-a", task: "lane test", lane: "ceo-1" })

      const state = await loadExecutionState(root)
      expect(state.dispatches[0]?.lane).toBe("ceo-1")
      expect(state.dispatches[0]?.roleInstance).toBe("engineer-a@ceo-1")
      expect(state.roles).toEqual(["engineer-a@ceo-1"])
    })
  })

  it("updates existing execution state entry instead of duplicating", async () => {
    await withTempProject(async (root) => {
      const hook = createDispatchLifecycleHook(root, { backend: "opencode" })
      const dispatchId = generateDispatchId("engineer-a")
      await hook.onDispatchStart({ dispatchId, role: "engineer-a", task: "test" })
      await hook.onDispatchComplete({ dispatchId, role: "engineer-a", task: "test", durationMs: 10 })
      await hook.onDispatchFail({ dispatchId, role: "engineer-a", task: "test", durationMs: 20, error: "retry" })

      const state = await loadExecutionState(root)
      expect(state.dispatches.length).toBe(1)
      expect(state.dispatches[0]?.status).toBe("failed")
      expect(state.dispatches[0]?.error).toBe("retry")
    })
  })
})
