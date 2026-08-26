export interface DraftConfig {
  leagueSize: number
  draftSlot: number
  leagueId: string | null
  userId: string | null
  draftId: string | null
}

interface DraftConfigFallback {
  leagueSize: number
  draftSlot: number
}

interface SleeperLeagueConfig {
  league_id: string
  total_rosters?: number
}

interface SleeperUserConfig {
  user_id: string
  username?: string
}

interface SleeperDraftConfig {
  draft_id: string
  status?: string
  draft_order?: Record<string, number> | null
  settings?: { teams?: number }
}

interface DeriveDraftConfigOptions {
  league: SleeperLeagueConfig
  user: SleeperUserConfig
  drafts: SleeperDraftConfig[]
  fallback: DraftConfigFallback
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

export function deriveDraftConfig({
  league,
  user,
  drafts,
  fallback,
}: DeriveDraftConfigOptions): DraftConfig {
  const activeDraft = drafts.find(
    (draft) => draft.status === 'drafting' || draft.status === 'pre_draft',
  ) ?? drafts[0] ?? null
  const leagueSize = positiveInteger(
    league.total_rosters ?? activeDraft?.settings?.teams,
    fallback.leagueSize,
  )
  const draftSlot = Math.min(
    leagueSize,
    positiveInteger(activeDraft?.draft_order?.[user.user_id], fallback.draftSlot),
  )

  return {
    leagueSize,
    draftSlot,
    leagueId: league.league_id,
    userId: user.user_id,
    draftId: activeDraft?.draft_id ?? null,
  }
}
