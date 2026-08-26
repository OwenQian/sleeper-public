import { describe, expect, it, vi } from 'vitest'
import {
  createSupabaseDraftStore,
  draftRecordId,
  fromDraftRow,
  savedDraftFromSleeper,
  toDraftRow,
} from './draftStore'
import type { SavedDraft } from '../types'

const savedDraft: SavedDraft = {
  draftId: 'draft-123',
  sleeperUserId: 'user-456',
  leagueId: null,
  season: 2026,
  name: 'Mock draft',
  status: 'complete',
  type: 'mock',
  teams: 12,
  rounds: 15,
  draftSlot: 2,
  participants: { 'user-456': 'Sam' },
  picks: [{ player_id: 'one', pick_no: 1, round: 1, draft_slot: 1 }],
  metadata: { scoring_type: 'ppr' },
  createdAt: '2026-08-25T20:00:00.000Z',
  syncedAt: '2026-08-25T21:00:00.000Z',
}

describe('draft row mapping', () => {
  it('uses a user-scoped record id and round-trips a saved draft', () => {
    expect(draftRecordId('draft-123', 'user-456')).toBe('draft-123:user-456')
    expect(fromDraftRow(toDraftRow(savedDraft))).toEqual(savedDraft)
  })

  it('uses Sleeper draft start time instead of room creation time', () => {
    const draft = savedDraftFromSleeper({
      draft_id: 'draft-123',
      start_time: 1787711110888,
      created: 1787711099719,
    }, [], {}, 'user-456')

    expect(draft.createdAt).toBe('2026-08-26T02:25:10.888Z')
  })
})

describe('createSupabaseDraftStore', () => {
  it('loads the most recently started drafts for only the configured user', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [toDraftRow(savedDraft)], error: null })
    const order = vi.fn(() => ({ limit }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const store = createSupabaseDraftStore({ from } as never, { userId: 'user-456' })

    await expect(store.list(8)).resolves.toEqual([savedDraft])
    expect(from).toHaveBeenCalledWith('drafts')
    expect(eq).toHaveBeenCalledWith('sleeper_user_id', 'user-456')
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false, nullsFirst: false })
    expect(limit).toHaveBeenCalledWith(8)
  })

  it('idempotently upserts a draft record', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ upsert }))
    const store = createSupabaseDraftStore({ from } as never, { userId: 'user-456' })

    await store.save(savedDraft)

    expect(upsert).toHaveBeenCalledWith(toDraftRow(savedDraft), { onConflict: 'id' })
  })
})
