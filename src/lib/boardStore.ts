import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player } from '../types'
import { derivePositionTiers } from './rankings'

export interface BoardSnapshot {
  players: Player[]
}

export interface BoardIdentity {
  leagueId?: string
  userId?: string
}

export interface BoardStore {
  load: () => Promise<BoardSnapshot | null>
  save: (snapshot: BoardSnapshot) => Promise<void>
}

export function resolveBoardId(identity: BoardIdentity): string {
  if (identity.leagueId?.trim()) {
    return `${identity.leagueId.trim()}:${identity.userId?.trim() || 'anonymous'}`
  }
  return 'default'
}

export function mergeStoredPlayers(sourcePlayers: Player[], storedPlayers: Player[]): Player[] {
  const sourceById = new Map(sourcePlayers.map((player) => [player.id, player]))
  const validStored = storedPlayers
    .filter((player) => sourceById.has(player.id) || player.position === 'K' || player.position === 'DEF')
    .map((player) => sourceById.has(player.id) ? { ...sourceById.get(player.id)!, ...player } : player)
  const seen = new Set(validStored.map((player) => player.id))
  const missing = sourcePlayers.filter((player) => !seen.has(player.id))

  return derivePositionTiers(
    [...validStored, ...missing].map((player, index) => ({ ...player, rank: index + 1 })),
  )
}

export function createSupabaseBoardStore(
  client: SupabaseClient,
  identity: BoardIdentity,
): BoardStore {
  const boardId = resolveBoardId(identity)

  return {
    async load() {
      const { data, error } = await client
        .from('draft_board_state')
        .select('state')
        .eq('id', boardId)
        .maybeSingle()

      if (error) throw error
      return data?.state as BoardSnapshot | null ?? null
    },
    async save(snapshot) {
      const { error } = await client.from('draft_board_state').upsert({
        id: boardId,
        league_id: identity.leagueId?.trim() || null,
        sleeper_user_id: identity.userId?.trim() || null,
        state: snapshot,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
  }
}
