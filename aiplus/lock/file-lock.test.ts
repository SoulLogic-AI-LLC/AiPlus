import { describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { acquireExclusiveLock, withLock } from "./file-lock"

function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-file-lock-"))
  return run(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }))
}

function absModulePath(): string {
  return path.resolve(process.cwd(), "aiplus/lock/file-lock.ts")
}

describe("file-lock", () => {
  it("serializes concurrent withLock calls in one process", async () => {
    await withTempDir(async (dir) => {
      const lockPath = path.join(dir, "test.lock")
      const outPath = path.join(dir, "out.txt")
      const workers = Array.from({ length: 10 }, (_, i) => async () => {
        await withLock(lockPath, async () => {
          fs.appendFileSync(outPath, `start-${i}\n`)
          Bun.sleepSync(5)
          fs.appendFileSync(outPath, `end-${i}\n`)
        })
      })
      await Promise.all(workers.map((w) => w()))
      const lines = fs.readFileSync(outPath, "utf-8").trim().split("\n")
      expect(lines.length).toBe(20)
      for (let i = 0; i < lines.length; i += 2) {
        const startId = lines[i]?.match(/^start-(\d+)$/)?.[1]
        const endId = lines[i + 1]?.match(/^end-(\d+)$/)?.[1]
        expect(startId).toBeDefined()
        expect(endId).toBeDefined()
        expect(startId).toBe(endId)
      }
    })
  })

  it("releases on double release without error", async () => {
    await withTempDir(async (dir) => {
      const lock = await acquireExclusiveLock(path.join(dir, "test.lock"))
      lock.release()
      lock.release()
    })
  })

  it("serializes writes from multiple child processes", async () => {
    await withTempDir(async (dir) => {
      const lockPath = path.join(dir, "test.lock")
      const outPath = path.join(dir, "out.txt")
      const modulePath = absModulePath()
      const script = `
import { withLock } from ${JSON.stringify(modulePath)}
import * as fs from "node:fs"
const id = process.argv[2]
await withLock(${JSON.stringify(lockPath)}, async () => {
  fs.appendFileSync(${JSON.stringify(outPath)}, "start-" + id + "\\n")
  await new Promise(r => setTimeout(r, 20))
  fs.appendFileSync(${JSON.stringify(outPath)}, "end-" + id + "\\n")
})
`
      const scriptPath = path.join(dir, "worker.ts")
      fs.writeFileSync(scriptPath, script)
      const children = Array.from({ length: 5 }, (_, i) => (
        Bun.spawn(["bun", "run", scriptPath, String(i)], { stdout: "inherit", stderr: "inherit" })
      ))
      for (const child of children) await child.exited
      const lines = fs.readFileSync(outPath, "utf-8").trim().split("\n")
      expect(lines.length).toBe(10)
      for (let i = 0; i < lines.length; i += 2) {
        const startId = lines[i]?.match(/^start-(\d+)$/)?.[1]
        const endId = lines[i + 1]?.match(/^end-(\d+)$/)?.[1]
        expect(startId).toBeDefined()
        expect(endId).toBeDefined()
        expect(startId).toBe(endId)
      }
    })
  })

  it("releases lock when holder is killed with -9", async () => {
    await withTempDir(async (dir) => {
      const lockPath = path.join(dir, "test.lock")
      const markerPath = path.join(dir, "locked.marker")
      const successPath = path.join(dir, "success.marker")
      const modulePath = absModulePath()
      const holderScript = `
import { acquireExclusiveLock } from ${JSON.stringify(modulePath)}
import * as fs from "node:fs"
const lock = await acquireExclusiveLock(${JSON.stringify(lockPath)})
fs.writeFileSync(${JSON.stringify(markerPath)}, "locked")
await new Promise(() => {})
`
      const holderScriptPath = path.join(dir, "holder.ts")
      fs.writeFileSync(holderScriptPath, holderScript)
      const holder = Bun.spawn(["bun", "run", holderScriptPath], { stdout: "inherit", stderr: "inherit" })

      // Wait for holder to acquire lock
      let waited = 0
      while (!fs.existsSync(markerPath) && waited < 5000) {
        await Bun.sleep(10)
        waited += 10
      }
      expect(fs.existsSync(markerPath)).toBe(true)

      process.kill(holder.pid, "SIGKILL")
      await holder.exited

      const acquirerScript = `
import { withLock } from ${JSON.stringify(modulePath)}
import * as fs from "node:fs"
await withLock(${JSON.stringify(lockPath)}, async () => {
  fs.writeFileSync(${JSON.stringify(successPath)}, "ok")
})
`
      const acquirerScriptPath = path.join(dir, "acquirer.ts")
      fs.writeFileSync(acquirerScriptPath, acquirerScript)
      const acquirer = Bun.spawn(["bun", "run", acquirerScriptPath], { stdout: "inherit", stderr: "inherit" })
      await acquirer.exited
      expect(fs.existsSync(successPath)).toBe(true)
    })
  })

  it("fallback lock serializes writes when forced", async () => {
    await withTempDir(async (dir) => {
      const lockPath = path.join(dir, "test.lock")
      const outPath = path.join(dir, "out.txt")
      const modulePath = absModulePath()
      const script = `
process.env.AIPLUS_FILE_LOCK_FORCE_FALLBACK = "1"
import { withLock } from ${JSON.stringify(modulePath)}
import * as fs from "node:fs"
const id = process.argv[2]
await withLock(${JSON.stringify(lockPath)}, async () => {
  fs.appendFileSync(${JSON.stringify(outPath)}, "line-" + id + "\\n")
})
`
      const scriptPath = path.join(dir, "worker.ts")
      fs.writeFileSync(scriptPath, script)
      const children = Array.from({ length: 8 }, (_, i) => (
        Bun.spawn(["bun", "run", scriptPath, String(i)], { stdout: "inherit", stderr: "inherit" })
      ))
      for (const child of children) await child.exited
      const lines = fs.readFileSync(outPath, "utf-8").trim().split("\n")
      expect(lines.length).toBe(8)
    })
  })
})
