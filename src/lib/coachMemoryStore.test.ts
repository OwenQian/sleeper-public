import { describe, expect, it, vi } from 'vitest'
import {
  createSupabaseCoachMemoryStore,
  fromCoachMemoryRow,
  type CoachMemoryRow,
} from './coachMemoryStore'

const row: CoachMemoryRow = {
  id: 'memory-1',
  sleeper_user_id: 'user-456',
  content: 'You reach for QBs two rounds early.',
  role: 'assistant',
  scope: 'draft',
  draft_id: 'draft-123',
  draft_name: 'Tuesday mock',
  created_at: '2026-08-26T12:00:00.000Z',
}

describe('fromCoachMemoryRow', () => {
  it('maps a database row to a coach memory', () => {
    expect(fromCoachMemoryRow(row)).toEqual({
      id: 'memory-1',
      content: 'You reach for QBs two rounds early.',
      role: 'assistant',
      scope: 'draft',
      draftId: 'draft-123',
      draftName: 'Tuesday mock',
      createdAt: '2026-08-26T12:00:00.000Z',
    })
  })
})

describe('createSupabaseCoachMemoryStore', () => {
  it('lists the newest memories for only the configured user', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [row], error: null })
    const order = vi.fn(() => ({ limit }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const store = createSupabaseCoachMemoryStore({ from } as never, { userId: 'user-456' })

    await expect(store.list(10)).resolves.toEqual([fromCoachMemoryRow(row)])
    expect(from).toHaveBeenCalledWith('coach_memories')
    expect(eq).toHaveBeenCalledWith('sleeper_user_id', 'user-456')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(10)
  })

  it('inserts a user-scoped memory and returns the stored record', async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))
    const store = createSupabaseCoachMemoryStore({ from } as never, { userId: 'user-456' })

    await expect(store.save({
      content: 'You reach for QBs two rounds early.',
      role: 'assistant',
      scope: 'draft',
      draftId: 'draft-123',
      draftName: 'Tuesday mock',
    })).resolves.toEqual(fromCoachMemoryRow(row))

    expect(insert).toHaveBeenCalledWith({
      sleeper_user_id: 'user-456',
      content: 'You reach for QBs two rounds early.',
      role: 'assistant',
      scope: 'draft',
      draft_id: 'draft-123',
      draft_name: 'Tuesday mock',
    })
  })

  it('deletes only the configured user\'s memory', async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null })
    const eqId = vi.fn(() => ({ eq: eqUser }))
    const deleteRow = vi.fn(() => ({ eq: eqId }))
    const from = vi.fn(() => ({ delete: deleteRow }))
    const store = createSupabaseCoachMemoryStore({ from } as never, { userId: 'user-456' })

    await store.delete('memory-1')

    expect(from).toHaveBeenCalledWith('coach_memories')
    expect(eqId).toHaveBeenCalledWith('id', 'memory-1')
    expect(eqUser).toHaveBeenCalledWith('sleeper_user_id', 'user-456')
  })
})
