import { Global } from "@opencode-ai/core/global"
import { ServerAuth } from "@/server/auth"
import { Effect } from "effect"
import { randomBytes, randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"

const PASSWORD_FILE = "daemon.password"

function passwordFilePath() {
  return path.join(Global.Path.data, PASSWORD_FILE)
}

function currentPassword() {
  const value = process.env.OPENCODE_SERVER_PASSWORD?.trim()
  return value ? value : undefined
}

function currentUsername() {
  return process.env.OPENCODE_SERVER_USERNAME?.trim() || "opencode"
}

const readPasswordFile = Effect.fn("Cli.daemon-auth.readPasswordFile")(function* () {
  const file = passwordFilePath()
  return yield* Effect.promise(async () => {
    try {
      const value = (await fs.readFile(file, "utf8")).trim()
      return value || undefined
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw err
    }
  })
})

const writePasswordFile = Effect.fn("Cli.daemon-auth.writePasswordFile")(function* (password: string) {
  const file = passwordFilePath()
  const temp = file + "." + randomUUID() + ".tmp"
  yield* Effect.promise(() => fs.mkdir(Global.Path.data, { recursive: true }))
  yield* Effect.promise(() => fs.writeFile(temp, password + "\n", { mode: 0o600 }))
  yield* Effect.promise(() => fs.rename(temp, file))
  yield* Effect.promise(() => fs.chmod(file, 0o600))
})

const ensurePassword = Effect.fn("Cli.daemon-auth.ensurePassword")(function* () {
  const password = currentPassword()
  if (password) {
    yield* writePasswordFile(password)
    return password
  }

  const existing = yield* readPasswordFile()
  if (existing) return existing

  const file = passwordFilePath()
  const generated = randomBytes(32).toString("base64url")
  yield* Effect.promise(() => fs.mkdir(Global.Path.data, { recursive: true }))
  yield* Effect.promise(async () => {
    try {
      const handle = await fs.open(file, "wx", 0o600)
      await handle.writeFile(generated + "\n", "utf8")
      await handle.close()
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
    }
  })

  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const written = yield* readPasswordFile()
    if (written) {
      yield* Effect.promise(() => fs.chmod(file, 0o600))
      return written
    }
    yield* Effect.sleep("25 millis")
  }

  throw new Error(`daemon password file remained empty: ${file}`)
})

const readPassword = Effect.fn("Cli.daemon-auth.readPassword")(function* () {
  return currentPassword() ?? (yield* readPasswordFile())
})

const readHeader = Effect.fn("Cli.daemon-auth.readHeader")(function* () {
  const password = yield* readPassword()
  if (!password) return undefined
  return ServerAuth.header({
    password,
    username: currentUsername(),
  })
})

export const DaemonAuth = {
  ensurePassword,
  readPassword,
  readHeader,
}
