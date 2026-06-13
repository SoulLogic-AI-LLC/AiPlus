/**
 * Agent Memory — Redaction Pipeline (V2)
 *
 * 12 rules ported from AiPlus-Source (crates/aiplus-cli/src/main.rs,
 * crates/aiplus-core/src/sensitive_text.rs).
 *
 * Order matters: earlier rules fire first. Apply before writing to any JSONL.
 */

import type { RedactionRule } from "./types"

// ---- 12 Redaction Rules ---------------------------------------------------

const RULES: RedactionRule[] = [
  // r1: OpenAI key (sk-...)
  {
    name: "openai_key",
    pattern: /sk-[A-Za-z0-9]{32,}/g,
    replacement: "[REDACTED_OPENAI_KEY]",
    description: "OpenAI API key pattern sk-<hex>",
  },
  // r2: AWS key (AKIA...)
  {
    name: "aws_key",
    pattern: /AKIA[A-Z0-9]{16}/g,
    replacement: "[REDACTED_AWS_KEY]",
    description: "AWS access key ID pattern AKIA<16 hex>",
  },
  // r3: GCP service account key
  {
    name: "gcp_key",
    pattern: /"private_key":\s*"-----BEGIN PRIVATE KEY-----[^"]*"/g,
    replacement: '"[REDACTED_GCP_KEY]"',
    description: "GCP service account private_key field",
  },
  // r4: Private key block (PEM)
  {
    name: "private_key_pem",
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_KEY]",
    description: "PEM-encoded private key block",
  },
  // r5: api_key = value (backreference prevents eating JSON structural quotes)
  {
    name: "api_key_assignment",
    pattern: /api_key\s*[:=]\s*(["']?)([^\s"',}]+)\1/gi,
    replacement: "api_key=[REDACTED_API_KEY]",
    description: "api_key in config/env/code",
  },
  // r6: token = value (backreference prevents eating JSON structural quotes)
  {
    name: "token_assignment",
    pattern: /(?:access_)?token\s*[:=]\s*(["']?)([^\s"',}]+)\1/gi,
    replacement: "token=[REDACTED_TOKEN]",
    description: "access_token / token in config",
  },
  // r7: secret = value (backreference prevents eating JSON structural quotes)
  {
    name: "secret_assignment",
    pattern: /(?:client_)?secret\s*[:=]\s*(["']?)([^\s"',}]+)\1/gi,
    replacement: "secret=[REDACTED_SECRET]",
    description: "secret / client_secret field",
  },
  // r8: password = value (backreference prevents eating JSON structural quotes)
  {
    name: "password_assignment",
    pattern: /password\s*[:=]\s*(["']?)([^\s"',}]+)\1/gi,
    replacement: "password=[REDACTED_PW]",
    description: "password field in config",
  },
  // r9: Authorization: Bearer token
  {
    name: "auth_header",
    pattern: /Authorization:\s*Bearer\s+\S+/gi,
    replacement: "Authorization: Bearer [REDACTED_AUTH]",
    description: "HTTP Authorization Bearer header",
  },
  // r10: Private IPv4 (10.x, 192.168.x, 172.16-31.x)
  {
    name: "private_ip",
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: "[REDACTED_IP]",
    description: "Private IPv4 address (10/8, 192.168/16, 172.16/12)",
  },
  // r11: Owner home path (/Users/<name>/...)
  {
    name: "owner_path",
    pattern: /(?:\/home\/\w+|\/Users\/\w+)\/[\w.\/-]*/g,
    replacement: "[REDACTED_OWNER_PATH]",
    description: "Absolute path under /Users or /home",
  },
  // r12: Private email (non-public domains)
  {
    name: "private_email",
    pattern: /\b[A-Za-z0-9._%+-]+@(?!gmail\.com|outlook\.com|yahoo\.com|icloud\.com|hotmail\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
    description: "Email on non-public-mailbox domains (company/internal)",
  },
]

// ---- Pipeline -------------------------------------------------------------

/**
 * Apply all redaction rules to a text string.
 *
 * Rules are applied in definition order. Earlier rules take priority —
 * if rule A matches a substring, rule B will NOT re-match the redacted
 * output (replacement text does not contain sensitive patterns).
 *
 * Returns the redacted string. If nothing matched, returns the original.
 */
export function applyRedaction(text: string): string {
  let result = text
  for (const rule of RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }
  return result
}

/**
 * Check if a text contains any sensitive material (used as a pre-write gate).
 * Returns the name of the first matched rule, or null if clean.
 */
export function detectFirstSensitive(text: string): string | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.name
  }
  return null
}

/**
 * Export the rule list for testing and audit.
 */
export function getRedactionRules(): readonly RedactionRule[] {
  return RULES
}
