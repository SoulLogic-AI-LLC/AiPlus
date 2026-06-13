/**
 * Overclaim — Packet Loader
 *
 * Ported from AiPlus Source: crates/aiplus-cli/src/overclaim/parse.rs
 */

import * as fs from "node:fs"
import type { EvidencePacket } from "./schema"

const SCHEMA_VERSION_V1 = "overclaim-evidence-packet: v1"
const SCHEMA_VERSION_V2 = "overclaim-evidence-packet: v2"
const SUPPORTED = [SCHEMA_VERSION_V1, SCHEMA_VERSION_V2]

export class PacketLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PacketLoadError"
  }
}

/**
 * Load and validate an evidence packet from a JSON file.
 * v1 packets lack a `level` field — serde defaults to L0_Asserted.
 */
export function loadPacket(filePath: string): EvidencePacket {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, "utf-8")
  } catch {
    throw new PacketLoadError(`cannot read packet file: ${filePath}`)
  }

  let packet: EvidencePacket
  try {
    packet = JSON.parse(raw)
  } catch (err) {
    throw new PacketLoadError(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!SUPPORTED.includes(packet.schema_version)) {
    throw new PacketLoadError(
      `unsupported schema_version: ${packet.schema_version} (supported: ${SUPPORTED.join(", ")})`,
    )
  }

  // v1 packets lack `level` — default to L0_Asserted
  for (const claim of packet.claims) {
    if (!claim.level) (claim as any).level = "L0_Asserted"
  }

  return packet
}
