import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import http from "http"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { testProviderConfig } from "../lib/test-provider"

const packageRoot = path.resolve(import.meta.dir, "../..")

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("expected TCP address"))
        return
      }

      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

async function waitFor<A>(label: string, fn: () => Promise<A | undefined>, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn().catch(() => undefined)
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`timed out waiting for ${label}`)
}

describe("opencode daemon (subprocess)", () => {
  test(
    "writes the daemon password file and protects /global/health",
    async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "home")
      const port = await freePort()
      await fs.mkdir(home, { recursive: true })

      const env = {
        ...process.env,
        HOME: home,
        OPENCODE_AUTH_CONTENT: "{}",
        OPENCODE_CONFIG_CONTENT: JSON.stringify(testProviderConfig("http://127.0.0.1:1")),
        OPENCODE_DAEMON_PORT: String(port),
        OPENCODE_DISABLE_AUTOCOMPACT: "1",
        OPENCODE_DISABLE_AUTOUPDATE: "1",
        OPENCODE_DISABLE_MODELS_FETCH: "1",
        OPENCODE_DISABLE_PROJECT_CONFIG: "1",
        OPENCODE_PURE: "1",
        OPENCODE_TEST_HOME: home,
        XDG_CACHE_HOME: path.join(home, ".cache"),
        XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_DATA_HOME: path.join(home, ".local/share"),
        XDG_STATE_HOME: path.join(home, ".local/state"),
      }

      const proc = Bun.spawn(["bun", "run", "--conditions=browser", "./src/index.ts", "daemon"], {
        cwd: packageRoot,
        env,
        stderr: "pipe",
        stdout: "pipe",
      })

      try {
        const dataDir = path.join(home, ".local/share", "opencode")
        const passwordFile = path.join(dataDir, "daemon.password")
        const portFile = path.join(dataDir, "daemon.port")

        await waitFor("daemon health endpoint", async () => {
          const response = await fetch(`http://127.0.0.1:${port}/global/health`).catch(() => undefined)
          if (!response) return undefined
          return response.status === 401 || response.status === 200 ? response.status : undefined
        })

        await waitFor("daemon password file", async () => {
          try {
            return await fs.stat(passwordFile)
          } catch {
            return undefined
          }
        })

        await waitFor("daemon port file", async () => {
          try {
            return await fs.stat(portFile)
          } catch {
            return undefined
          }
        })

        const password = (await fs.readFile(passwordFile, "utf8")).trim()
        const stat = await fs.stat(passwordFile)
        const portInfo = JSON.parse(await fs.readFile(portFile, "utf8")) as { port: number }

        expect(portInfo.port).toBe(port)
        expect(password.length).toBeGreaterThan(20)
        expect(stat.mode & 0o777).toBe(0o600)

        const unauthenticated = await fetch(`http://127.0.0.1:${port}/global/health`)
        expect(unauthenticated.status).toBe(401)

        const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`
        const authenticated = await fetch(`http://127.0.0.1:${port}/global/health`, {
          headers: { Authorization: authorization },
        })
        expect(authenticated.status).toBe(200)
      } finally {
        proc.kill()
        await proc.exited.catch(() => undefined)
      }
    },
    30000,
  )
})
