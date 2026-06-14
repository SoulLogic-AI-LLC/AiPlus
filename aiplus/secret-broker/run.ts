/**
 * Secret Broker — Run (V1)
 *
 * Resolves secret aliases to values from OpenCode auth.json,
 * injects them into the child process environment, and spawns
 * the given command. Secret values are never logged or persisted.
 *
 * Usage:
 *   bun run aiplus/secret-broker/run.ts --alias DEEPSEEK_API_KEY -- my-command
 *   bun run aiplus/secret-broker/run.ts --aliases DEEPSEEK_API_KEY,OPENAI_API_KEY -- my-command
 */

import { spawn } from "node:child_process"
import { resolveSecret, resolveAlias } from "./query"

// ---- Arg parsing -----------------------------------------------------------

interface RunArgs {
  aliases: string[]
  command: string[]
}

/** Parse CLI args into aliases + command. */
function parseArgs(argv: string[]): RunArgs {
  const args = argv.slice(2) // skip bun + script path
  const aliases: string[] = []
  let command: string[] = []
  let i = 0

  while (i < args.length) {
    const arg = args[i]

    if (arg === "--alias" && i + 1 < args.length) {
      aliases.push(args[i + 1])
      i += 2
    } else if (arg === "--aliases" && i + 1 < args.length) {
      const names = args[i + 1].split(",").map(s => s.trim()).filter(Boolean)
      aliases.push(...names)
      i += 2
    } else if (arg === "--") {
      command = args.slice(i + 1)
      break
    } else {
      i++
    }
  }

  return { aliases, command }
}

// ---- Run -------------------------------------------------------------------

/**
 * Resolve aliases to secret values and spawn command with injected env.
 *
 * Returns the child process exit code. Secrets are injected as env vars
 * using the alias name as key (e.g., DEEPSEEK_API_KEY=sk-...).
 *
 * Errors: missing alias, unreadable source, missing command → exit 1.
 */
export async function runWithSecrets(
  aliases: string[],
  command: string[],
): Promise<number> {
  if (command.length === 0) {
    process.stderr.write("[secret-broker] error: no command after --\n")
    return 1
  }

  // Resolve all secrets
  const env: Record<string, string> = {}
  for (const alias of aliases) {
    const value = resolveSecret(alias)
    if (value === null) {
      const entry = resolveAlias(alias)
      if (!entry) {
        process.stderr.write(`[secret-broker] error: alias "${alias}" not found\n`)
      } else {
        process.stderr.write(`[secret-broker] error: could not read secret for "${alias}" (source: ${entry.source})\n`)
      }
      return 1
    }
    env[alias.toUpperCase()] = value
  }

  // Spawn child process with injected env
  const [cmd, ...cmdArgs] = command
  const child = spawn(cmd, cmdArgs, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  })

  return new Promise<number>((resolve) => {
    child.on("close", (code) => {
      resolve(code ?? 0)
    })
    child.on("error", (err) => {
      process.stderr.write(`[secret-broker] spawn error: ${err.message}\n`)
      resolve(1)
    })
  })
}

// ---- Main ------------------------------------------------------------------

if (import.meta.main) {
  const { aliases, command } = parseArgs(process.argv)

  if (aliases.length === 0) {
    process.stderr.write("[secret-broker] usage: --alias NAME -- command\n")
    process.stderr.write("  or: --aliases NAME1,NAME2 -- command\n")
    process.exit(1)
  }

  const exitCode = await runWithSecrets(aliases, command)
  process.exit(exitCode)
}
