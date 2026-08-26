import type { SupabaseClient } from '@supabase/supabase-js'
import type { SavedDraft, SleeperDraft, SleeperPick } from '../types'

export interface DraftStoreIdentity {
  userId: string
}

export interface DraftHistoryStore {
  userId: string
  list: (limit?: number) => Promise<SavedDraft[]>
  get: (draftId: string) => Promise<SavedDraft | null>
  save: (draft: SavedDraft) => Promise<void>
  delete: (draftId: string) => Promise<void>
}

export interface DraftRow {
  id: string
  draft_id: string
  sleeper_user_id: string
  league_id: string | null
  season: number
  name: string
  status: string
  draft_type: string
  teams: number
  rounds: number
  draft_slot: number | null
  participants: Record<string, string>
  picks: SleeperPick[]
  metadata: Record<string, unknown>
  created_at: string | null
  synced_at: string
}

function sleeperTimestamp(value?: number): string | null {
  if (!value) return null
  return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toISOString()
}

export function savedDraftFromSleeper(
  draft: SleeperDraft,
  picks: SleeperPick[],
  participants: Record<string, string>,
  sleeperUserId: string,
): SavedDraft {
  const metadata = draft.metadata ?? {}
  const draftName = typeof metadata.name === 'string' && metadata.name.trim()
    ? metadata.name.trim()
    : `Sleeper draft ${draft.draft_id.slice(-6)}`
  return {
    draftId: draft.draft_id,
    sleeperUserId,
    leagueId: draft.league_id ?? null,
    season: Number.parseInt(draft.season ?? '2026', 10) || 2026,
    name: draftName,
    status: draft.status ?? 'drafting',
    type: draft.type ?? 'mock',
    teams: draft.settings?.teams ?? Math.max(1, ...picks.map((pick) => pick.draft_slot), 12),
    rounds: draft.settings?.rounds ?? Math.max(1, ...picks.map((pick) => pick.round), 15),
    draftSlot: draft.draft_order?.[sleeperUserId] ?? null,
    participants,
    picks: [...picks].sort((left, right) => left.pick_no - right.pick_no),
    metadata: { ...metadata, last_picked: draft.last_picked ?? null },
    createdAt: sleeperTimestamp(draft.start_time ?? draft.created),
    syncedAt: new Date().toISOString(),
  }
}

export function draftRecordId(draftId: string, userId: string): string {
  return `${draftId}:${userId}`
}

export function toDraftRow(draft: SavedDraft): DraftRow {
  return {
    id: draftRecordId(draft.draftId, draft.sleeperUserId),
    draft_id: draft.draftId,
    sleeper_user_id: draft.sleeperUserId,
    league_id: draft.leagueId,
    season: draft.season,
    name: draft.name,
    status: draft.status,
    draft_type: draft.type,
    teams: draft.teams,
    rounds: draft.rounds,
    draft_slot: draft.draftSlot,
    participants: draft.participants,
    picks: [...draft.picks].sort((left, right) => left.pick_no - right.pick_no),
    metadata: draft.metadata,
    created_at: draft.createdAt,
    synced_at: draft.syncedAt,
  }
}

export function fromDraftRow(row: DraftRow): SavedDraft {
  return {
    draftId: row.draft_id,
    sleeperUserId: row.sleeper_user_id,
    leagueId: row.league_id,
    season: row.season,
    name: row.name,
    status: row.status,
    type: row.draft_type,
    teams: row.teams,
    rounds: row.rounds,
    draftSlot: row.draft_slot,
    participants: row.participants,
    picks: row.picks,
    metadata: row.metadata,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  }
}

export function createSupabaseDraftStore(
  client: SupabaseClient,
  identity: DraftStoreIdentity,
): DraftHistoryStore {
  return {
    userId: identity.userId,
    async list(limit = 100) {
      const { data, error } = await client
        .from('drafts')
        .select('*')
        .eq('sleeper_user_id', identity.userId)
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as DraftRow[]).map(fromDraftRow)
    },
    async get(draftId) {
      const { data, error } = await client
        .from('drafts')
        .select('*')
        .eq('id', draftRecordId(draftId, identity.userId))
        .maybeSingle()
      if (error) throw error
      return data ? fromDraftRow(data as DraftRow) : null
    },
    async save(draft) {
      const scopedDraft = { ...draft, sleeperUserId: identity.userId }
      const { error } = await client
        .from('drafts')
        .upsert(toDraftRow(scopedDraft), { onConflict: 'id' })
      if (error) throw error
    },
    async delete(draftId) {
      const { error } = await client
        .from('drafts')
        .delete()
        .eq('id', draftRecordId(draftId, identity.userId))
      if (error) throw error
    },
  }
}
