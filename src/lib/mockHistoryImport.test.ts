import { describe, expect, it, vi } from 'vitest'
import {
  importSleeperMockDraftIds,
  parseSleeperMockImportIds,
} from './mockHistoryImport'
import type { DraftHistoryStore } from './draftStore'

describe('parseSleeperMockImportIds', () => {
  it('extracts unique draft IDs from comma-separated links and IDs', () => {
    expect(parseSleeperMockImportIds(
      '1300000000000000002,https://sleeper.com/draft/nfl/1300000000000000001,1300000000000000002',
    )).toEqual(['1300000000000000002', '1300000000000000001'])
  })
})

describe('importSleeperMockDraftIds', () => {
  it('persists archived mocks using their league draft as the settings template', async () => {
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const referenceDraft = {
      draft_id: 'official-1', league_id: 'league-1', season: '2026', status: 'pre_draft', type: 'snake',
      start_time: 1787792449000, created: 1781745174303,
      settings: { teams: 12, rounds: 15 }, metadata: { name: 'Go sports', scoring_type: 'half_ppr' },
    }
    const fetchLeagueDrafts = vi.fn().mockResolvedValue([referenceDraft])
    const fetchDraftDetails = vi.fn().mockResolvedValue({
      draft_id: 'mock-1', start_time: 1787703622973, created: 1787703606252,
    })
    const fetchArchivedMock = vi.fn().mockResolvedValue({
      picks: [{ player_id: '8137', pick_no: 23, round: 2, draft_slot: 2, picked_by: 'user-1' }],
      participants: { 'user-1': 'Sam' },
      metadata: { name: 'Go sports', type: 'league_mock' },
    })

    await expect(importSleeperMockDraftIds(
      store,
      ['mock-1'],
      'league-1',
      { fetchLeagueDrafts, fetchArchivedMock, fetchDraftDetails },
    )).resolves.toBe(1)

    expect(fetchArchivedMock).toHaveBeenCalledWith('mock-1', 12, 'snake')
    expect(fetchDraftDetails).toHaveBeenCalledWith('mock-1')
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'mock-1',
      leagueId: null,
      season: 2026,
      status: 'complete',
      name: 'Go sports',
      draftSlot: 2,
      createdAt: '2026-08-26T00:20:22.973Z',
      picks: [expect.objectContaining({ pick_no: 23 })],
    }))
  })
})
