import type { LobbyStatusResponse } from "../lobby/types"

/** Fetch wrapper for AiPlus B0 REST endpoints. */
export function createAiPlusClient(baseUrl: string) {
  return {
    async lobbyStatus(): Promise<LobbyStatusResponse | null> {
      try {
        const res = await fetch(`${baseUrl}/aiplus/lobby/status`)
        if (!res.ok) return null
        return (await res.json()) as LobbyStatusResponse
      } catch {
        return null
      }
    },
  }
}
