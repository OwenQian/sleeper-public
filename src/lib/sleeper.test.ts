import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendSpecialTeams, applyDraftPicks, enrichPlayers, extractDraftId, fetchArchivedMockDraft, fetchDraftPicks, fetchSleeperUser, fetchUserDrafts, getOffensiveDepthGroups, getTeamSchedule, resolvePickAttribution } from './sleeper'
import type { Player } from '../types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchSleeperUser', () => {
  it('looks up a URL-encoded Sleeper username', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user_id: '123', username: 'Sam Lee' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSleeperUser('Sam Lee')).resolves.toMatchObject({ user_id: '123' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/user/Sam%20Lee',
      { signal: undefined },
    )
  })
})

describe('fetchDraftPicks', () => {
  it('bypasses intermediary caches when a fresh sync is requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(1724631715000)

    await fetchDraftPicks('1300000000000000002', undefined, { fresh: true })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/draft/1300000000000000002/picks?sync=1724631715000',
      { signal: undefined, cache: 'no-store' },
    )
  })
})

describe('fetchArchivedMockDraft', () => {
  it('recovers picks and participants from Sleeper GraphQL and derives snake slots', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          draft_picks: [
            { draft_id: 'mock-1', pick_no: 23, player_id: '8137', picked_by: 'user-1', metadata: { first_name: 'George', last_name: 'Pickens' } },
          ],
          user_drafts_by_draft: [
            { user_id: 'user-1', user_display_name: 'Sam', user_is_bot: false, metadata: { name: 'Go sports', type: 'league_mock' } },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchArchivedMockDraft('mock-1', 12, 'snake')).resolves.toEqual({
      picks: [expect.objectContaining({ pick_no: 23, round: 2, draft_slot: 2, player_id: '8137' })],
      participants: { 'user-1': 'Sam' },
      metadata: { name: 'Go sports', type: 'league_mock' },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sleeper.app/graphql',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    )
  })
})

describe('fetchUserDrafts', () => {
  it('lists a Sleeper user\'s NFL drafts for the selected season', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ draft_id: 'draft-1' }] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchUserDrafts('user-123', 2026)).resolves.toEqual([{ draft_id: 'draft-1' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/user/user-123/drafts/nfl/2026',
      { signal: undefined },
    )
  })
})

describe('extractDraftId', () => {
  it('accepts a bare id or a Sleeper draft URL', () => {
    expect(extractDraftId('123456789012345678')).toBe('123456789012345678')
    expect(extractDraftId('https://sleeper.com/draft/nfl/123456789012345678')).toBe(
      '123456789012345678',
    )
  })

  it('rejects input without a Sleeper-sized numeric id', () => {
    expect(extractDraftId('not-a-draft')).toBeNull()
    expect(extractDraftId('1234')).toBeNull()
  })
})

describe('getTeamSchedule', () => {
  it('returns the opponent and venue from league games', () => {
    const games = [
      { week: 1, home: 'BUF', away: 'NYJ', date: '2026-09-13' },
      { week: 2, home: 'MIA', away: 'BUF', date: '2026-09-20' },
      { week: 3, home: 'NE', away: 'NYJ', date: '2026-09-27' },
    ]

    expect(getTeamSchedule(games, 'BUF')).toEqual([
      { week: 1, opponent: 'NYJ', venue: 'home', date: '2026-09-13' },
      { week: 2, opponent: 'MIA', venue: 'away', date: '2026-09-20' },
    ])
  })
})

describe('applyDraftPicks', () => {
  it('reconciles Sleeper picks without changing manual availability choices', () => {
    const players = [
      { id: 'one', sleeperId: '101', name: 'One', unavailable: false },
      { id: 'two', sleeperId: '102', name: 'Two', unavailable: true, unavailableSource: 'sleeper' },
      { id: 'three', sleeperId: '103', name: 'Three', unavailable: true, unavailableSource: 'manual' },
    ] as Player[]

    const result = applyDraftPicks(players, [
      { player_id: '101', pick_no: 1, round: 1, draft_slot: 1 },
    ])

    expect(result[0]).toMatchObject({ unavailable: true, unavailableSource: 'sleeper' })
    expect(result[1]).toMatchObject({ unavailable: false, unavailableSource: undefined })
    expect(result[2]).toMatchObject({ unavailable: true, unavailableSource: 'manual' })
  })
})

describe('enrichPlayers', () => {
  it('matches known source-name variants to Sleeper player names', () => {
    const rankings = [
      { id: 'kenneth-gainwell-rb', name: 'Kenneth Gainwell', position: 'RB' },
      { id: 'nick-singleton-rb', name: 'Nick Singleton', position: 'RB' },
    ] as Player[]
    const catalog = {
      '7567': { player_id: '7567', full_name: 'Kenny Gainwell', team: 'TB' },
      '13288': { player_id: '13288', full_name: 'Nicholas Singleton', team: 'TEN' },
    }

    expect(enrichPlayers(rankings, catalog, []).map((player) => player.sleeperId)).toEqual([
      '7567',
      '13288',
    ])
  })

  it('selects the same-name record with a usable half-PPR ADP', () => {
    const rankings = [
      { id: 'lamar-jackson-qb', name: 'Lamar Jackson', position: 'QB' },
    ] as Player[]
    const catalog = {
      '4881': { player_id: '4881', full_name: 'Lamar Jackson', position: 'QB', team: 'BAL' },
      '6994': { player_id: '6994', full_name: 'Lamar Jackson', position: 'QB', team: null },
    }
    const projections = [
      { player_id: '4881', stats: { adp_half_ppr: 34.4 } },
      { player_id: '6994', stats: { adp_half_ppr: 999 } },
    ]

    expect(enrichPlayers(rankings, catalog, projections)[0]).toMatchObject({
      sleeperId: '4881',
      team: 'BAL',
      adp: 34.4,
    })
  })
})

describe('getOffensiveDepthGroups', () => {
  it('combines Sleeper WR1, WR2, and WR3 roles into one receiver group', () => {
    const groups = getOffensiveDepthGroups({
      QB: ['qb1'],
      RB: ['rb1'],
      WR1: ['wr1', 'backup1'],
      WR2: ['wr2'],
      WR3: ['wr3'],
      TE: ['te1'],
    })

    expect(groups.WR).toEqual(['wr1', 'backup1', 'wr2', 'wr3'])
    expect(groups.QB).toEqual(['qb1'])
  })
})

describe('appendSpecialTeams', () => {
  it('adds Sleeper-ranked kickers and defenses missing from the source CSV', () => {
    const rankings = [{ id: 'one-rb', name: 'One', position: 'RB', rank: 1, overallTier: 4 }] as Player[]
    const catalog = {
      '900': { player_id: '900', full_name: 'Best Kicker', position: 'K', team: 'KC' },
      DEN: { player_id: 'DEN', full_name: 'Denver Broncos', position: 'DEF', team: 'DEN' },
      '901': { player_id: '901', full_name: 'Ignore QB', position: 'QB', team: 'BUF' },
    }
    const projections = [
      { player_id: '900', stats: { adp_half_ppr: 140 } },
      { player_id: 'DEN', stats: { adp_half_ppr: 125 } },
      { player_id: '901', stats: { adp_half_ppr: 20 } },
    ]

    const result = appendSpecialTeams(rankings, catalog, projections)

    expect(result.map((player) => player.name)).toEqual(['One', 'Denver Broncos', 'Best Kicker'])
    expect(result.slice(1).map((player) => player.position)).toEqual(['DEF', 'K'])
    expect(result.slice(1).map((player) => player.rank)).toEqual([2, 3])
  })

  it('takes the 15 best Sleeper ADPs for both K and DEF when the CSV has neither', () => {
    const rankings = [{ id: 'one-rb', name: 'One', position: 'RB', rank: 1, overallTier: 4 }] as Player[]
    const catalog = Object.fromEntries(
      (['K', 'DEF'] as const).flatMap((position) =>
        Array.from({ length: 18 }, (_, index) => {
          const id = `${position}-${index + 1}`
          return [id, {
            player_id: id,
            full_name: `${position} ${index + 1}`,
            position,
            team: position === 'DEF' ? id : 'KC',
          }]
        }),
      ),
    )
    const projections = Object.keys(catalog).map((playerId, index) => ({
      player_id: playerId,
      stats: { adp_half_ppr: 100 + index },
    }))

    const result = appendSpecialTeams(rankings, catalog, projections)

    expect(result.filter((player) => player.position === 'K')).toHaveLength(15)
    expect(result.filter((player) => player.position === 'DEF')).toHaveLength(15)
    expect(result.some((player) => player.sleeperId === 'K-18')).toBe(false)
    expect(result.some((player) => player.sleeperId === 'DEF-18')).toBe(false)
  })
})

describe('resolvePickAttribution', () => {
  it('shows the manager display name for a human pick', () => {
    const pick = {
      player_id: '9226',
      pick_no: 2,
      round: 1,
      draft_slot: 2,
      picked_by: '1000000000000000001',
    }

    expect(resolvePickAttribution(pick, { '1000000000000000001': 'samlee' })).toBe('samlee · Slot 2')
  })

  it('labels an unowned mock-draft slot as CPU', () => {
    const pick = {
      player_id: '5859',
      pick_no: 19,
      round: 2,
      draft_slot: 6,
      picked_by: '',
    }

    expect(resolvePickAttribution(pick, {})).toBe('CPU · Slot 6')
  })
})
