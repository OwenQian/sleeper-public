export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
export type PositionFilter = 'ALL' | Position | 'FLEX'

export type PlayerTag =
  | 'target'
  | 'avoid'
  | 'upside'
  | 'floor'
  | 'injury'
  | 'rookie'
  | 'ambiguous-role'

export interface Player {
  id: string
  sleeperId?: string
  name: string
  position: Position
  sourcePositionRank: number
  sourceRank?: number
  sourceOverallTier?: number
  rank: number
  overallTier: number
  positionTier: number
  auctionValue: number
  adp?: number
  team?: string
  tags: PlayerTag[]
  unavailable: boolean
  unavailableSource?: 'manual' | 'sleeper'
  rankingEdited?: boolean
  note?: string
  injuryStatus?: string | null
  depthChartOrder?: number | null
  yearsExperience?: number | null
}

export interface SleeperPlayer {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  position?: string
  fantasy_positions?: string[]
  team?: string | null
  injury_status?: string | null
  injury_notes?: string | null
  depth_chart_order?: number | null
  years_exp?: number | null
}

export interface SleeperProjection {
  player_id: string
  stats?: {
    adp_half_ppr?: number
    pts_half_ppr?: number
  }
}

export interface SleeperPick {
  pick_no: number
  round: number
  draft_slot: number
  player_id: string
  picked_by?: string
  roster_id?: number | null
  metadata?: {
    first_name?: string
    last_name?: string
    position?: string
  }
}

export interface SleeperDraft {
  draft_id: string
  league_id?: string | null
  draft_order?: Record<string, number> | null
  season?: string
  status?: string
  type?: string
  start_time?: number
  created?: number
  last_picked?: number
  metadata?: Record<string, string | number | boolean | null>
  settings?: {
    teams?: number
    rounds?: number
    slots_qb?: number
    slots_rb?: number
    slots_wr?: number
    slots_te?: number
    slots_flex?: number
    [key: string]: number | undefined
  }
}

export interface SavedDraft {
  draftId: string
  sleeperUserId: string
  leagueId: string | null
  season: number
  name: string
  status: string
  type: string
  teams: number
  rounds: number
  draftSlot: number | null
  participants: Record<string, string>
  picks: SleeperPick[]
  metadata: Record<string, unknown>
  createdAt: string | null
  syncedAt: string
}

export interface SleeperUser {
  user_id: string
  display_name?: string
  username?: string
}

export interface ScheduleGame {
  week: number
  home: string
  away: string
  date: string
}

export interface TeamGame {
  week: number
  opponent: string
  venue: 'home' | 'away'
  date: string
}
