import type {
  Player,
  Position,
  ScheduleGame,
  SleeperDraft,
  SleeperPick,
  SleeperPlayer,
  SleeperProjection,
  SleeperUser,
  TeamGame,
} from '../types'
import { derivePositionTiers } from './rankings'

export const SLEEPER_API = 'https://api.sleeper.app/v1'
export const SLEEPER_DATA_API = 'https://api.sleeper.com'

export function extractDraftId(input: string): string | null {
  const match = input.trim().match(/(?:^|\/)(\d{15,22})(?:\/?(?:\?.*)?$|$)/)
  return match?.[1] ?? null
}

export function getTeamSchedule(games: ScheduleGame[], team: string): TeamGame[] {
  return games
    .filter((game) => game.home === team || game.away === team)
    .map((game) => ({
      week: game.week,
      opponent: game.home === team ? game.away : game.home,
      venue: game.home === team ? 'home' as const : 'away' as const,
      date: game.date,
    }))
    .sort((left, right) => left.week - right.week)
}

export function applyDraftPicks(players: Player[], picks: SleeperPick[]): Player[] {
  const draftedIds = new Set(picks.map((pick) => pick.player_id))
  return players.map((player) => {
    if (player.sleeperId && draftedIds.has(player.sleeperId)) {
      return { ...player, unavailable: true, unavailableSource: 'sleeper' }
    }
    if (player.unavailableSource === 'sleeper') {
      return { ...player, unavailable: false, unavailableSource: undefined }
    }
    return player
  })
}

export function resolvePickAttribution(
  pick: SleeperPick,
  participantNames: Record<string, string>,
): string {
  if (!pick.picked_by) return `CPU · Slot ${pick.draft_slot}`
  const manager = participantNames[pick.picked_by] ?? 'Manager'
  return `${manager} · Slot ${pick.draft_slot}`
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const PLAYER_NAME_ALIASES: Record<string, string> = {
  kennethgainwell: 'kennygainwell',
  nicksingleton: 'nicholassingleton',
}

export function enrichPlayers(
  rankings: Player[],
  sleeperPlayers: Record<string, SleeperPlayer>,
  projections: SleeperProjection[],
): Player[] {
  const byName = new Map<string, SleeperPlayer[]>()
  Object.values(sleeperPlayers).forEach((player) => {
    const fullName = player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
    if (!fullName) return
    const normalizedName = normalizeName(fullName)
    byName.set(normalizedName, [...(byName.get(normalizedName) ?? []), player])
  })
  const projectionById = new Map(projections.map((projection) => [projection.player_id, projection]))

  return rankings.map((ranking) => {
    const normalizedRankingName = normalizeName(ranking.name)
    const candidates = byName.get(PLAYER_NAME_ALIASES[normalizedRankingName] ?? normalizedRankingName) ?? []
    const match = [...candidates].sort((left, right) => {
      const score = (candidate: SleeperPlayer) => {
        const adp = projectionById.get(candidate.player_id)?.stats?.adp_half_ppr
        return (candidate.position === ranking.position ? 4 : 0)
          + (typeof adp === 'number' && adp < 900 ? 2 : 0)
          + (candidate.team ? 1 : 0)
      }
      return score(right) - score(left)
    })[0]
    if (!match) return ranking
    const projection = projectionById.get(match.player_id)
    return {
      ...ranking,
      sleeperId: match.player_id,
      team: match.team ?? undefined,
      adp: projection?.stats?.adp_half_ppr,
      injuryStatus: match.injury_status,
      depthChartOrder: match.depth_chart_order,
      yearsExperience: match.years_exp,
    }
  })
}

export function getOffensiveDepthGroups(
  depthChart: Record<string, string[]>,
): Record<'QB' | 'RB' | 'WR' | 'TE', string[]> {
  return {
    QB: depthChart.QB ?? [],
    RB: depthChart.RB ?? [],
    WR: ['WR', 'WR1', 'WR2', 'WR3'].flatMap((role) => depthChart[role] ?? []),
    TE: depthChart.TE ?? [],
  }
}

export function appendSpecialTeams(
  rankings: Player[],
  sleeperPlayers: Record<string, SleeperPlayer>,
  projections: SleeperProjection[],
  limitPerPosition = 15,
): Player[] {
  const existingSleeperIds = new Set(rankings.map((player) => player.sleeperId).filter(Boolean))
  const lastTier = Math.max(...rankings.map((player) => player.overallTier), 0)
  const lastRank = Math.max(...rankings.map((player) => player.rank), 0)
  const positionCounts = new Map<Position, number>()
  rankings.forEach((player) => positionCounts.set(player.position, (positionCounts.get(player.position) ?? 0) + 1))

  const candidates = (['K', 'DEF'] as Position[]).flatMap((position) =>
    projections
      .filter((projection) => {
        const adp = projection.stats?.adp_half_ppr
        return sleeperPlayers[projection.player_id]?.position === position
          && typeof adp === 'number'
          && adp < 900
          && !existingSleeperIds.has(projection.player_id)
      })
      .sort((left, right) => left.stats!.adp_half_ppr! - right.stats!.adp_half_ppr!)
      .slice(0, limitPerPosition),
  ).sort((left, right) => left.stats!.adp_half_ppr! - right.stats!.adp_half_ppr!)

  const supplemental = candidates.map((projection, index): Player => {
    const sleeperPlayer = sleeperPlayers[projection.player_id]
    const position = sleeperPlayer.position as Position
    const positionRank = (positionCounts.get(position) ?? 0) + 1
    positionCounts.set(position, positionRank)
    const name = sleeperPlayer.full_name
      ?? (`${sleeperPlayer.first_name ?? ''} ${sleeperPlayer.last_name ?? ''}`.trim() || projection.player_id)

    return {
      id: `${normalizeName(name)}-${position.toLowerCase()}`,
      sleeperId: projection.player_id,
      name,
      position,
      sourcePositionRank: positionRank,
      rank: lastRank + index + 1,
      overallTier: lastTier + 1 + Math.floor(index / 6),
      positionTier: 1,
      auctionValue: 1,
      adp: projection.stats?.adp_half_ppr,
      team: sleeperPlayer.team ?? (position === 'DEF' ? projection.player_id : undefined),
      tags: [],
      unavailable: false,
      injuryStatus: sleeperPlayer.injury_status,
      depthChartOrder: sleeperPlayer.depth_chart_order,
      yearsExperience: sleeperPlayer.years_exp,
    }
  })

  return derivePositionTiers([...rankings, ...supplemental])
}

async function fetchJson<T>(url: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, signal })
  if (!response.ok) throw new Error(`Sleeper returned ${response.status}`)
  return response.json() as Promise<T>
}

export function fetchPlayers(signal?: AbortSignal) {
  return fetchJson<Record<string, SleeperPlayer>>(`${SLEEPER_API}/players/nfl`, signal)
}

export function fetchSleeperUser(username: string, signal?: AbortSignal) {
  return fetchJson<SleeperUser | null>(
    `${SLEEPER_API}/user/${encodeURIComponent(username.trim())}`,
    signal,
  )
}

export function fetchUserDrafts(userId: string, season = 2026, signal?: AbortSignal) {
  return fetchJson<SleeperDraft[]>(
    `${SLEEPER_API}/user/${encodeURIComponent(userId)}/drafts/nfl/${season}`,
    signal,
  )
}

export function fetchLeagueDrafts(leagueId: string, signal?: AbortSignal) {
  return fetchJson<SleeperDraft[]>(
    `${SLEEPER_API}/league/${encodeURIComponent(leagueId)}/drafts`,
    signal,
  )
}

interface ArchivedMockDraftResponse {
  data?: {
    draft_picks?: Array<{
      draft_id: string
      pick_no: number
      player_id: string
      picked_by?: string
      metadata?: SleeperPick['metadata']
    }>
    user_drafts_by_draft?: Array<{
      user_id: string
      user_display_name?: string
      user_is_bot?: boolean
      metadata?: Record<string, string | number | boolean | null>
    }>
  }
  errors?: Array<{ message?: string }>
}

export interface ArchivedMockDraft {
  picks: SleeperPick[]
  participants: Record<string, string>
  metadata: Record<string, string | number | boolean | null>
}

export async function fetchArchivedMockDraft(
  draftId: string,
  teams: number,
  draftType = 'snake',
  signal?: AbortSignal,
): Promise<ArchivedMockDraft> {
  const query = `query archived_mock_draft {
    draft_picks(draft_id: "${draftId}") {
      draft_id pick_no player_id picked_by metadata
    }
    user_drafts_by_draft(draft_id: "${draftId}") {
      user_id user_display_name user_is_bot metadata
    }
  }`
  const response = await fetchJson<ArchivedMockDraftResponse>(
    'https://api.sleeper.app/graphql',
    signal,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    },
  )
  if (response.errors?.length) {
    throw new Error(response.errors[0]?.message ?? 'Sleeper could not recover this mock draft.')
  }

  const participants = Object.fromEntries(
    (response.data?.user_drafts_by_draft ?? []).map((user) => [
      user.user_id,
      user.user_display_name ?? `Manager ${user.user_id.slice(-4)}`,
    ]),
  )
  const metadata = response.data?.user_drafts_by_draft?.[0]?.metadata ?? {}
  const picks = (response.data?.draft_picks ?? []).map((pick) => {
    const round = Math.floor((pick.pick_no - 1) / teams) + 1
    const offset = (pick.pick_no - 1) % teams
    const draftSlot = draftType === 'snake' && round % 2 === 0 ? teams - offset : offset + 1
    return { ...pick, round, draft_slot: draftSlot }
  })

  return { picks, participants, metadata }
}

export function fetchProjections(season = 2026, signal?: AbortSignal) {
  return fetchJson<SleeperProjection[]>(
    `${SLEEPER_DATA_API}/projections/nfl/${season}?season_type=regular`,
    signal,
  )
}

export function fetchSchedule(season = 2026, signal?: AbortSignal) {
  return fetchJson<ScheduleGame[]>(
    `${SLEEPER_DATA_API}/schedule/nfl/regular/${season}`,
    signal,
  )
}

export function fetchDepthChart(team: string, signal?: AbortSignal) {
  return fetchJson<Record<string, string[]>>(
    `${SLEEPER_DATA_API}/players/nfl/${team}/depth_chart`,
    signal,
  )
}

export function fetchDraftPicks(
  draftId: string,
  signal?: AbortSignal,
  options: { fresh?: boolean } = {},
) {
  const cacheBuster = options.fresh ? `?sync=${Date.now()}` : ''
  return fetchJson<SleeperPick[]>(
    `${SLEEPER_API}/draft/${draftId}/picks${cacheBuster}`,
    signal,
    options.fresh ? { cache: 'no-store' } : undefined,
  )
}

export function fetchDraft(draftId: string, signal?: AbortSignal) {
  return fetchJson<SleeperDraft>(`${SLEEPER_API}/draft/${draftId}`, signal)
}

export async function fetchDraftParticipants(
  draftId: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const draft = await fetchDraft(draftId, signal)
  const users = draft.league_id
    ? await fetchJson<SleeperUser[]>(`${SLEEPER_API}/league/${draft.league_id}/users`, signal)
    : await Promise.all(
      Object.keys(draft.draft_order ?? {}).map((userId) =>
        fetchJson<SleeperUser>(`${SLEEPER_API}/user/${userId}`, signal),
      ),
    )

  return Object.fromEntries(
    users.map((user) => [user.user_id, user.display_name ?? user.username ?? `Manager ${user.user_id.slice(-4)}`]),
  )
}
