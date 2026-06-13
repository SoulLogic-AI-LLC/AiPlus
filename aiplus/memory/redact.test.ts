/**
 * Agent Memory — Redaction Tests (V2)
 *
 * 12 rules, one case each.
 */

import { describe, it, expect } from "vitest"
import { applyRedaction, detectFirstSensitive, getRedactionRules } from "./redact"

describe("getRedactionRules", () => {
  it("has exactly 12 rules", () => {
    expect(getRedactionRules()).toHaveLength(12)
  })
})

describe("applyRedaction", () => {
  it("r1: redacts OpenAI key", () => {
    const input = 'key=sk-ProjAbCdEf1234567890AbCdEf1234567890AbCdEf1234567890'
    const result = applyRedaction(input)
    expect(result).not.toContain("sk-Proj")
    expect(result).toContain("[REDACTED_OPENAI_KEY]")
  })

  it("r2: redacts AWS key", () => {
    const input = "AKIA1234567890ABCDEF"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_AWS_KEY]")
    expect(result).not.toContain("AKIA")
  })

  it("r3: redacts GCP private_key", () => {
    const input = '"private_key": "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n"'
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_GCP_KEY]")
    expect(result).not.toContain("BEGIN PRIVATE")
  })

  it("r4: redacts PEM private key block", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_KEY]")
    expect(result).not.toContain("PRIVATE KEY")
  })

  it("r5: redacts api_key assignment", () => {
    const input = 'api_key = "sk-live-12345"'
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_API_KEY]")
  })

  it("r6: redacts token assignment", () => {
    const input = "access_token: ghp_abcdef1234567890"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_TOKEN]")
    expect(result).not.toContain("ghp_")
  })

  it("r7: redacts secret assignment", () => {
    const input = "client_secret=ABCD1234xyz"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_SECRET]")
  })

  it("r8: redacts password assignment", () => {
    const input = "password = 's3cur3!'"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_PW]")
  })

  it("r9: redacts Authorization Bearer header", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_AUTH]")
    expect(result).not.toContain("eyJhbG")
  })

  it("r10: redacts private IPv4 addresses", () => {
    const input = "host=10.0.0.1 backup=192.168.1.100 gateway=172.16.0.1"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_IP]")
    expect(result).not.toContain("10.0.0.1")
  })

  it("r11: redacts owner home paths", () => {
    const input = "path=/Users/alice/projects/secret and /home/bob/keys"
    const result = applyRedaction(input)
    expect(result).toContain("[REDACTED_OWNER_PATH]")
    expect(result).not.toContain("/Users/alice")
  })

  it("r12: redacts private email (keeps gmail)", () => {
    const input = "alice@gmail.com and bob@my-company.internal and carol@outlook.com"
    const result = applyRedaction(input)
    expect(result).toContain("alice@gmail.com") // preserved
    expect(result).toContain("carol@outlook.com") // preserved
    expect(result).toContain("[REDACTED_EMAIL]") // company email redacted
  })

  it("leaves clean text unchanged", () => {
    const input = "The quick brown fox jumps over the lazy dog."
    expect(applyRedaction(input)).toBe(input)
  })
})

describe("detectFirstSensitive", () => {
  it("returns null for clean text", () => {
    expect(detectFirstSensitive("hello world")).toBeNull()
  })

  it("returns rule name for sensitive text", () => {
    expect(detectFirstSensitive("api_key=abc123")).toBe("api_key_assignment")
  })
})
