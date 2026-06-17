/**
 * OpenRouter Pricing Cache
 *
 * Fetches https://openrouter.ai/api/v1/models, caches to disk with 1-hour TTL.
 * Designed to be called by the AMTP dispatch advisor (PR-3).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs"
import * as path from "node:path"

const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_DIR = ".aiplus/agent-performance"
const CACHE_FILE = "openrouter-pricing.json"

export interface OpenRouterPricing {
  id: string
  context: number
  promptPer1k: number
  completionPer1k: number
}

export interface PricingCache {
  fetchedAt: string
  byModelId: Record<string, OpenRouterPricing>
}

interface OpenRouterApiModel {
  id: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
  }
}

interface OpenRouterApiResponse {
  data: OpenRouterApiModel[]
}

async function fetchOpenRouterPricing(apiKey: string): Promise<PricingCache> {
  const resp = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!resp.ok) throw new Error(`OpenRouter API ${resp.status}`)
  const body = (await resp.json()) as OpenRouterApiResponse

  const byModelId: Record<string, OpenRouterPricing> = {}
  for (const m of body.data) {
    byModelId[m.id] = {
      id: m.id,
      context: m.context_length ?? 0,
      promptPer1k: parseFloat(m.pricing?.prompt ?? "0") * 1000,
      completionPer1k: parseFloat(m.pricing?.completion ?? "0") * 1000,
    }
  }

  return { fetchedAt: new Date().toISOString(), byModelId }
}

function cachePath(projectRoot: string): string {
  return path.join(projectRoot, CACHE_DIR, CACHE_FILE)
}

function readCache(projectRoot: string): PricingCache | null {
  const p = cachePath(projectRoot)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as PricingCache
  } catch {
    return null
  }
}

function writeCache(projectRoot: string, cache: PricingCache): void {
  const p = cachePath(projectRoot)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(cache, null, 2))
}

export function isCacheFresh(projectRoot: string): boolean {
  const cached = readCache(projectRoot)
  if (!cached) return false
  return Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS
}

export function clearCache(projectRoot: string): void {
  const p = cachePath(projectRoot)
  if (existsSync(p)) unlinkSync(p)
}

export async function getCachedPricing(
  projectRoot: string,
  apiKey: string,
): Promise<PricingCache> {
  const cached = readCache(projectRoot)
  if (cached && isCacheFresh(projectRoot)) return cached

  try {
    const fresh = await fetchOpenRouterPricing(apiKey)
    writeCache(projectRoot, fresh)
    return fresh
  } catch {
    if (cached) return cached
    throw new Error("OpenRouter pricing unavailable: no cache and fetch failed")
  }
}
