import type { SupabaseClient } from '@supabase/supabase-js'

export interface CoachMemory {
  id: string
  content: string
  role: 'user' | 'assistant'
  scope: 'history' | 'draft'
  draftId: string | null
  draftName: string | null
  createdAt: string
}

export interface NewCoachMemory {
  content: string
  role: 'user' | 'assistant'
  scope: 'history' | 'draft'
  draftId?: string | null
  draftName?: string | null
}

export interface CoachMemoryStore {
  userId: string
  list: (limit?: number) => Promise<CoachMemory[]>
  save: (memory: NewCoachMemory) => Promise<CoachMemory>
  delete: (id: string) => Promise<void>
}

export interface CoachMemoryRow {
  id: string
  sleeper_user_id: string
  content: string
  role: 'user' | 'assistant'
  scope: 'history' | 'draft'
  draft_id: string | null
  draft_name: string | null
  created_at: string
}

export function fromCoachMemoryRow(row: CoachMemoryRow): CoachMemory {
  return {
    id: row.id,
    content: row.content,
    role: row.role,
    scope: row.scope,
    draftId: row.draft_id,
    draftName: row.draft_name,
    createdAt: row.created_at,
  }
}

export function createSupabaseCoachMemoryStore(
  client: SupabaseClient,
  identity: { userId: string },
): CoachMemoryStore {
  return {
    userId: identity.userId,
    async list(limit = 100) {
      const { data, error } = await client
        .from('coach_memories')
        .select('*')
        .eq('sleeper_user_id', identity.userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as CoachMemoryRow[]).map(fromCoachMemoryRow)
    },
    async save(memory) {
      const { data, error } = await client
        .from('coach_memories')
        .insert({
          sleeper_user_id: identity.userId,
          content: memory.content,
          role: memory.role,
          scope: memory.scope,
          draft_id: memory.draftId ?? null,
          draft_name: memory.draftName ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return fromCoachMemoryRow(data as CoachMemoryRow)
    },
    async delete(id) {
      const { error } = await client
        .from('coach_memories')
        .delete()
        .eq('id', id)
        .eq('sleeper_user_id', identity.userId)
      if (error) throw error
    },
  }
}
