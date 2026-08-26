import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player } from '../types'

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
