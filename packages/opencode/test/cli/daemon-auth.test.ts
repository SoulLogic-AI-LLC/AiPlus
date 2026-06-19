import { afterAll, describe, expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { DaemonAuth } from "../../src/cli/daemon-auth"

const passwordFilePath = path.join(Global.Path.data, "daemon.password")
const backupPath = passwordFilePath + ".test-backup"

async function savePasswordFile(): Promise<boolean> {
  try {
    await fs.copyFile(passwordFilePath, backupPath)
    return true
  } catch {
    return false
  }
}

async function restorePasswordFile() {
  try {
    await fs.rename(backupPath, passwordFilePath)
    return
  } catch {}

  try {
    await fs.unlink(passwordFilePath)
  } catch {}
}

afterAll(async () => {
  await restorePasswordFile()
})

describe("daemon auth", () => {
  test("persists env-supplied password for separate-process consumers", async () => {
    const previousPassword = process.env.OPENCODE_SERVER_PASSWORD
    const previousUsername = process.env.OPENCODE_SERVER_USERNAME
    await savePasswordFile()
    try {
      process.env.OPENCODE_SERVER_PASSWORD = "env-secret"
      process.env.OPENCODE_SERVER_USERNAME = "opencode"

      await expect(Effect.runPromise(DaemonAuth.ensurePassword())).resolves.toBe("env-secret")
      expect((await fs.readFile(passwordFilePath, "utf8")).trim()).toBe("env-secret")

      delete process.env.OPENCODE_SERVER_PASSWORD
      const header = await Effect.runPromise(DaemonAuth.readHeader())
      expect(header).toBe(`Basic ${Buffer.from("opencode:env-secret").toString("base64")}`)
    } finally {
      if (previousPassword === undefined) delete process.env.OPENCODE_SERVER_PASSWORD
      else process.env.OPENCODE_SERVER_PASSWORD = previousPassword
      if (previousUsername === undefined) delete process.env.OPENCODE_SERVER_USERNAME
      else process.env.OPENCODE_SERVER_USERNAME = previousUsername
    }
  })

  test("waits for shared password file content after EEXIST", async () => {
    const previous = process.env.OPENCODE_SERVER_PASSWORD
    delete process.env.OPENCODE_SERVER_PASSWORD
    await savePasswordFile()
    await fs.mkdir(path.dirname(passwordFilePath), { recursive: true })
    await fs.writeFile(passwordFilePath, "", { mode: 0o600 })

    const timer = setTimeout(() => {
      void fs.writeFile(passwordFilePath, "shared-password\n", { mode: 0o600 })
    }, 50)

    try {
      await expect(Effect.runPromise(DaemonAuth.ensurePassword())).resolves.toBe("shared-password")
    } finally {
      clearTimeout(timer)
      if (previous === undefined) delete process.env.OPENCODE_SERVER_PASSWORD
      else process.env.OPENCODE_SERVER_PASSWORD = previous
    }
  })
})
