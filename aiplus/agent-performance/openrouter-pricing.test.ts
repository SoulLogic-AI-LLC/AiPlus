/**
 * OpenRouter Pricing Cache — Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { getCachedPricing, isCacheFresh, clearCache } from "./openrouter-pricing"

const CACHE_DIR = ".aiplus/agent-performance"
const CACHE_FILE = "openrouter-pricing.json"

function cachePath(projectRoot: string): string {
  return path.join(projectRoot, CACHE_DIR, CACHE_FILE)
}

function fakeApiResponse(models: Array<{ id: string; prompt: number; completion: number }>) {
  return {
    data: models.map((m) => ({
      id: m.id,
      context_length: 128000,
      pricing: { prompt: String(m.prompt), completion: String(m.completion) },
    })),
  }
}

function mockFetch(response: Response) {
  const orig = globalThis.fetch
  globalThis.fetch = mock(() => Promise.resolve(response))
  return () => {
    globalThis.fetch = orig
  }
}

describe("openrouter-pricing", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiplus-or-pricing-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("fetch converts per-token pricing to per-1k", async () => {
    const apiModels = fakeApiResponse([{ id: "a/b", prompt: 0.003, completion: 0.015 }])
    const restore = mockFetch(new Response(JSON.stringify(apiModels), { status: 200 }))

    const result = await getCachedPricing(tmpDir, "sk-test")
    expect(result.byModelId["a/b"].promptPer1k).toBe(3.0)
    expect(result.byModelId["a/b"].completionPer1k).toBe(15.0)
    expect(result.byModelId["a/b"].context).toBe(128000)

    restore()
  })

  it("cache write/read round-trip via getCachedPricing", async () => {
    const apiModels = fakeApiResponse([{ id: "x/y", prompt: 0.001, completion: 0.005 }])
    const restore = mockFetch(new Response(JSON.stringify(apiModels), { status: 200 }))

    const result1 = await getCachedPricing(tmpDir, "sk-test")
    const cacheFile = cachePath(tmpDir)
    expect(fs.existsSync(cacheFile)).toBe(true)

    const raw = JSON.parse(fs.readFileSync(cacheFile, "utf-8"))
    expect(raw.byModelId["x/y"].promptPer1k).toBe(1.0)
    expect(raw.fetchedAt).toBe(result1.fetchedAt)

    restore()
  })

  it("isCacheFresh returns true within TTL, false when expired", () => {
    const cacheFile = cachePath(tmpDir)
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), byModelId: {} }))
    expect(isCacheFresh(tmpDir)).toBe(true)

    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        fetchedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
        byModelId: {},
      }),
    )
    expect(isCacheFresh(tmpDir)).toBe(false)
  })

  it("returns stale cache when fresh fetch fails", async () => {
    const cacheFile = cachePath(tmpDir)
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    const staleEntry = {
      fetchedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      byModelId: { "stale/model": { id: "stale/model", context: 4096, promptPer1k: 0.5, completionPer1k: 2.0 } },
    }
    fs.writeFileSync(cacheFile, JSON.stringify(staleEntry))

    const restore = mockFetch(new Response("internal error", { status: 500 }))

    const result = await getCachedPricing(tmpDir, "sk-test")
    expect(result.byModelId["stale/model"]).not.toBeUndefined()
    expect(result.fetchedAt).toBe(staleEntry.fetchedAt)

    restore()
  })

  it("throws when no cache and fetch fails", async () => {
    const restore = mockFetch(new Response("internal error", { status: 500 }))

    await expect(getCachedPricing(tmpDir, "sk-test")).rejects.toThrow(
      "OpenRouter pricing unavailable: no cache and fetch failed",
    )

    restore()
  })

  it("refreshes stale cache on successful fetch", async () => {
    const cacheFile = cachePath(tmpDir)
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        fetchedAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
        byModelId: {},
      }),
    )

    const apiModels = fakeApiResponse([{ id: "fresh/model", prompt: 0.002, completion: 0.008 }])
    const restore = mockFetch(new Response(JSON.stringify(apiModels), { status: 200 }))

    const result = await getCachedPricing(tmpDir, "sk-test")
    expect(result.byModelId["fresh/model"].promptPer1k).toBe(2.0)
    expect(result.byModelId["fresh/model"].completionPer1k).toBe(8.0)

    restore()
  })

  it("clearCache removes cache file", () => {
    const cacheFile = cachePath(tmpDir)
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: new Date().toISOString(), byModelId: {} }))
    expect(fs.existsSync(cacheFile)).toBe(true)

    clearCache(tmpDir)
    expect(fs.existsSync(cacheFile)).toBe(false)
  })

  it("isCacheFresh returns false when cache is missing", () => {
    expect(isCacheFresh(tmpDir)).toBe(false)
  })

  it("clearCache is idempotent when cache does not exist", () => {
    expect(() => clearCache(tmpDir)).not.toThrow()
  })
})
