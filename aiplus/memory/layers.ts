/**
 * Agent Memory — Layer Path Resolution (V2)
 */

import * as path from "node:path"

const MEMORY_DIR = ".aiplus/agent-memory"

/**
 * Resolve the JSONL file path for a given memory layer.
 *
 * - personal: .aiplus/agent-memory/<role>/memory.jsonl
 * - team:     .aiplus/agent-memory/_team/memory.jsonl
 * - project:  .aiplus/agent-memory/project/memory.jsonl
 */
export function resolveLayerPath(
  projectRoot: string,
  layer: "personal" | "team" | "project",
  role?: string,
): string {
  switch (layer) {
    case "personal": {
      if (!role) throw new Error("personal layer requires role")
      return path.join(projectRoot, MEMORY_DIR, role, "memory.jsonl")
    }
    case "team":
      return path.join(projectRoot, MEMORY_DIR, "_team", "memory.jsonl")
    case "project":
      return path.join(projectRoot, MEMORY_DIR, "project", "memory.jsonl")
  }
}
