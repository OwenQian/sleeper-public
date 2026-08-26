import { describe, expect, it, vi } from 'vitest'
import { importSleeperDrafts } from './draftImport'
import type { DraftHistoryStore } from './draftStore'

describe('importSleeperDrafts', () => {
  it('imports both mock and league drafts across the requested seasons', async () => {
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const mockDraft = {
      draft_id: 'mock-1', league_id: null, season: '2026', type: 'snake', status: 'complete',
      draft_order: { 'user-1': 2 }, settings: { teams: 12, rounds: 15 }, metadata: { name: 'Mock one' },
    }
    const leagueDraft = { ...mockDraft, draft_id: 'league-1', league_id: 'league-1' }
    const olderLeagueDraft = { ...leagueDraft, draft_id: 'league-older', season: '2025' }
    const listDrafts = vi.fn()
      .mockResolvedValueOnce([mockDraft, leagueDraft])
      .mockResolvedValueOnce([olderLeagueDraft])
    const fetchPicks = vi.fn().mockResolvedValue([{ player_id: 'one', pick_no: 1, round: 1, draft_slot: 1 }])
    const fetchParticipants = vi.fn().mockResolvedValue({ 'user-1': 'Sam' })
    const fetchDraftDetails = vi.fn()

    await expect(importSleeperDrafts(
      store,
      [2026, 2025],
      { listDrafts, fetchPicks, fetchParticipants, fetchDraftDetails },
    )).resolves.toBe(3)

    expect(listDrafts).toHaveBeenNthCalledWith(1, 'user-1', 2026)
    expect(listDrafts).toHaveBeenNthCalledWith(2, 'user-1', 2025)
    expect(fetchPicks).toHaveBeenCalledTimes(3)
    expect(fetchPicks).toHaveBeenCalledWith('league-1')
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'mock-1', name: 'Mock one' }))
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'league-1' }))
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'league-older' }))
  })

  it('refreshes a saved practice mock directly to recover its start time', async () => {
    const savedMock = {
      draftId: 'mock-1', sleeperUserId: 'user-1', leagueId: null, season: 2026,
      name: 'Mock one', status: 'complete', type: 'snake', teams: 12, rounds: 15,
      draftSlot: 2, participants: {}, picks: [], metadata: {}, createdAt: null,
      syncedAt: '2026-08-26T03:00:00.000Z',
    }
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([savedMock]),
      get: vi.fn().mockResolvedValue(savedMock),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const listDrafts = vi.fn().mockResolvedValue([])
    const fetchDraftDetails = vi.fn().mockResolvedValue({
      draft_id: 'mock-1', season: '2026', status: 'complete', type: 'snake',
      start_time: 1787703622973, settings: { teams: 12, rounds: 15 },
      draft_order: { 'user-1': 2 }, metadata: { name: 'Mock one' },
    })
    const fetchPicks = vi.fn().mockResolvedValue([{ player_id: 'one', pick_no: 1, round: 1, draft_slot: 1 }])
    const fetchParticipants = vi.fn().mockResolvedValue({ 'user-1': 'Sam' })

    await expect(importSleeperDrafts(
      store,
      2026,
      { listDrafts, fetchPicks, fetchParticipants, fetchDraftDetails },
    )).resolves.toBe(1)

    expect(fetchDraftDetails).toHaveBeenCalledWith('mock-1')
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'mock-1',
      createdAt: '2026-08-26T00:20:22.973Z',
    }))
  })
})
