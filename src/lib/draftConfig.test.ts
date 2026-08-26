import { describe, expect, it } from 'vitest'
import { deriveDraftConfig } from './draftConfig'

describe('deriveDraftConfig', () => {
  it('derives league size and the resolved users slot from the active Sleeper draft', () => {
    const config = deriveDraftConfig({
      league: { league_id: 'league-1', total_rosters: 12 },
      user: { user_id: 'user-2', username: 'samlee' },
      drafts: [
        {
          draft_id: 'old-draft',
          status: 'complete',
          draft_order: { 'user-2': 8 },
        },
        {
          draft_id: 'live-draft',
          status: 'pre_draft',
          draft_order: { 'user-2': 2 },
        },
      ],
      fallback: { leagueSize: 10, draftSlot: 4 },
    })

    expect(config).toEqual({
      leagueSize: 12,
      draftSlot: 2,
      leagueId: 'league-1',
      userId: 'user-2',
      draftId: 'live-draft',
    })
  })

  it('preserves the previous slot when the league has no assigned draft order yet', () => {
    const config = deriveDraftConfig({
      league: { league_id: 'league-1', total_rosters: 14 },
      user: { user_id: 'user-2' },
      drafts: [],
      fallback: { leagueSize: 12, draftSlot: 3 },
    })

    expect(config).toMatchObject({ leagueSize: 14, draftSlot: 3, draftId: null })
  })
})
