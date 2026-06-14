import { describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { checkDispatchChain } from "./dispatch-integrity"

function withTempProject(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-canonical-audit-"))
  try {
    fs.mkdirSync(path.join(root, ".aiplus", "agents"), { recursive: true })
    run(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe("canonical dispatch audit consumer", () => {
  it("prefers canonical shadow events when present", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "dispatch-log.jsonl"),
        JSON.stringify({
          dispatchId: "dispatch-1",
          role: "engineer-a",
          task: "one",
          timestamp: "2026-06-14T18:00:00.000Z",
        }) + "\n",
        "utf-8",
      )

      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "canonical-events.jsonl"),
        [
          JSON.stringify({
            schemaVersion: "0.1.0",
            eventType: "dispatch.created",
            eventId: "evt-1",
            timestamp: "2026-06-14T18:00:00.000Z",
            dispatchId: "dispatch-1",
            role: "engineer-a",
            source: "native-session-hook",
            status: "created",
            provenance: { transport: "native", emitter: "test", shadowMode: true },
            payload: { task: "one" },
          }),
          JSON.stringify({
            schemaVersion: "0.1.0",
            eventType: "dispatch.completed",
            eventId: "evt-2",
            timestamp: "2026-06-14T18:01:00.000Z",
            dispatchId: "dispatch-1",
            role: "engineer-a",
            source: "source-dispatch-complete",
            status: "completed",
            provenance: { transport: "cli", emitter: "test", shadowMode: true },
            payload: { durationMs: 10 },
          }),
        ].join("\n") + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("PASS")
      expect(result.detail).toContain("canonical dispatch events")
      expect(result.detail).toContain("parity=1")
    })
  })

  it("flags duplicate canonical dispatch starts", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "canonical-events.jsonl"),
        [
          JSON.stringify({
            schemaVersion: "0.1.0",
            eventType: "dispatch.created",
            eventId: "evt-1",
            timestamp: "2026-06-14T18:00:00.000Z",
            dispatchId: "dispatch-dup",
            role: "engineer-a",
            source: "native-session-hook",
            status: "created",
            provenance: { transport: "native", emitter: "test", shadowMode: true },
            payload: {},
          }),
          JSON.stringify({
            schemaVersion: "0.1.0",
            eventType: "dispatch.appended",
            eventId: "evt-2",
            timestamp: "2026-06-14T18:01:00.000Z",
            dispatchId: "dispatch-dup",
            role: "engineer-a",
            source: "native-cli-dispatch",
            status: "created",
            provenance: { transport: "cli", emitter: "test", shadowMode: true },
            payload: {},
          }),
        ].join("\n") + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("REVISE")
      expect(result.detail).toContain("duplicate canonical dispatch start")
    })
  })

  it("flags canonical parity mismatch against legacy dispatch starts", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "dispatch-log.jsonl"),
        JSON.stringify({
          dispatchId: "dispatch-legacy-only",
          role: "engineer-a",
          task: "one",
          timestamp: "2026-06-14T18:00:00.000Z",
        }) + "\n",
        "utf-8",
      )

      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "canonical-events.jsonl"),
        JSON.stringify({
          schemaVersion: "0.1.0",
          eventType: "dispatch.created",
          eventId: "evt-1",
          timestamp: "2026-06-14T18:00:00.000Z",
          dispatchId: "dispatch-canonical-only",
          role: "engineer-a",
          source: "native-session-hook",
          status: "created",
          provenance: { transport: "native", emitter: "test", shadowMode: true },
          payload: {},
        }) + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("REVISE")
      expect(result.detail).toContain("canonical/legacy dispatch parity mismatch")
      expect(result.detail).toContain("dispatch-legacy-only")
      expect(result.detail).toContain("dispatch-canonical-only")
    })
  })

  it("flags canonical divergence records before trusting parity", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "canonical-events.jsonl"),
        JSON.stringify({
          schemaVersion: "0.1.0",
          eventType: "dispatch.created",
          eventId: "evt-1",
          timestamp: "2026-06-14T18:00:00.000Z",
          dispatchId: "dispatch-1",
          role: "engineer-a",
          source: "native-session-hook",
          status: "created",
          provenance: { transport: "native", emitter: "test", shadowMode: true },
          payload: {},
        }) + "\n",
        "utf-8",
      )
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "canonical-divergence.jsonl"),
        JSON.stringify({
          schemaVersion: "0.1.0",
          timestamp: "2026-06-14T18:00:01.000Z",
          eventType: "dispatch.created",
          dispatchId: "dispatch-1",
          source: "test",
          status: "created",
          policy: "fail-open-shadow-write",
          reason: "EISDIR",
        }) + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("REVISE")
      expect(result.detail).toContain("canonical divergence recorded")
    })
  })

  it("accepts source-style legacy start plus complete rows with same dispatchId", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "dispatch-log.jsonl"),
        [
          JSON.stringify({
            dispatchId: "dispatch-legacy-1",
            role: "engineer-a",
            task: "one",
            timestamp: "2026-06-14T18:00:00.000Z",
          }),
          JSON.stringify({
            dispatchId: "dispatch-legacy-1",
            role: "engineer-a",
            task: "",
            event: "complete",
            timestamp: "2026-06-14T18:01:00.000Z",
          }),
        ].join("\n") + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("PASS")
      expect(result.detail).toContain("legacy dispatch lifecycles verified")
    })
  })

  it("flags a legacy complete row without a start row", () => {
    withTempProject((root) => {
      fs.writeFileSync(
        path.join(root, ".aiplus", "agents", "dispatch-log.jsonl"),
        JSON.stringify({
          dispatchId: "dispatch-legacy-2",
          role: "engineer-a",
          task: "",
          event: "complete",
          timestamp: "2026-06-14T18:01:00.000Z",
        }) + "\n",
        "utf-8",
      )

      const result = checkDispatchChain(root)
      expect(result.status).toBe("REVISE")
      expect(result.detail).toContain("complete without start")
    })
  })
})
