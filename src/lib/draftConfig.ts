export interface DraftConfig {
  leagueSize: number
  draftSlot: number
  leagueId: string | null
}

interface DraftConfigEnvironment {
  VITE_DRAFT_LEAGUE_SIZE?: string
  VITE_DRAFT_SLOT?: string
  VITE_SLEEPER_LEAGUE_ID?: string
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function readDraftConfigEnv(env: DraftConfigEnvironment): DraftConfig {
  const leagueSize = positiveInteger(env.VITE_DRAFT_LEAGUE_SIZE, 12)
  return {
    leagueSize,
    draftSlot: Math.min(leagueSize, positiveInteger(env.VITE_DRAFT_SLOT, 1)),
    leagueId: env.VITE_SLEEPER_LEAGUE_ID?.trim() || null,
  }
}
