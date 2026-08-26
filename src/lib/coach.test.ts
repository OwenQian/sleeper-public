import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCoachPayload, COACH_PRESETS, requestCoach } from './coach'
import type { CoachMemory } from './coachMemoryStore'
import type { Player, SavedDraft } from '../types'

function draft(index: number): SavedDraft {
  return {
    draftId: `draft-${index}`, sleeperUserId: 'user-1', leagueId: null, season: 2026,
    name: `Mock ${index}`, status: 'complete', type: 'snake', teams: 12, rounds: 15,
    draftSlot: 2, participants: {}, picks: [], metadata: {}, createdAt: null,
    syncedAt: new Date(Date.UTC(2026, 7, index)).toISOString(),
  }
}

describe('buildCoachPayload', () => {
  it('caps history coaching at the eight most recent drafts', () => {
    const payload = buildCoachPayload('history', Array.from({ length: 10 }, (_, index) => draft(index + 1)), [
      { role: 'user', content: 'What patterns do you see?' },
    ])

    expect(payload.drafts).toHaveLength(8)
    expect(payload.drafts.map((item) => item.draftId)).toEqual([
      'draft-10', 'draft-9', 'draft-8', 'draft-7', 'draft-6', 'draft-5', 'draft-4', 'draft-3',
    ])
  })

  it('sends exactly one draft for a draft-scoped coach', () => {
    const payload = buildCoachPayload('draft', [draft(3), draft(2)], [])

    expect(payload.drafts.map((item) => item.draftId)).toEqual(['draft-3'])
  })

  it('orders coaching history by draft date rather than import date', () => {
    const olderDraft = {
      ...draft(1),
      createdAt: '2026-07-01T18:00:00.000Z',
      syncedAt: '2026-08-26T02:00:00.000Z',
    }
    const newerDraft = {
      ...draft(2),
      createdAt: '2026-08-01T18:00:00.000Z',
      syncedAt: '2026-08-25T02:00:00.000Z',
    }

    expect(buildCoachPayload('history', [olderDraft, newerDraft], []).drafts.map((item) => item.draftId))
      .toEqual(['draft-2', 'draft-1'])
  })

  it('includes the user board with tiers, tags, and notes for the playback tool', () => {
    const player = (rank: number): Player => ({
      id: `player-${rank}`, sleeperId: `${1000 + rank}`, name: `Player ${rank}`, position: 'RB',
      sourcePositionRank: rank, rank, overallTier: 1, positionTier: 2, auctionValue: 10,
      adp: rank + 0.5, team: 'SF', tags: [], unavailable: false,
    })
    const tagged: Player = { ...player(1), tags: ['target'], note: '  League winner upside.  ' }
    const payload = buildCoachPayload('draft', [draft(1)], [], [player(2), tagged], [])

    expect(payload.players).toEqual([
      {
        sleeperId: '1001', name: 'Player 1', position: 'RB', rank: 1, overallTier: 1,
        positionTier: 2, adp: 1.5, team: 'SF', tags: ['target'], note: 'League winner upside.',
      },
      { sleeperId: '1002', name: 'Player 2', position: 'RB', rank: 2, overallTier: 1, positionTier: 2, adp: 2.5, team: 'SF' },
    ])
  })

  it('caps the player pool at 300 entries by rank', () => {
    const players = Array.from({ length: 350 }, (_, index): Player => ({
      id: `player-${index}`, name: `Player ${index}`, position: 'WR',
      sourcePositionRank: index + 1, rank: index + 1, overallTier: 1, positionTier: 1,
      auctionValue: 1, tags: [], unavailable: false,
    }))
    const payload = buildCoachPayload('draft', [draft(1)], [], players, [])

    expect(payload.players).toHaveLength(300)
    expect(payload.players[299].rank).toBe(300)
  })

  it('passes coach notes through to the payload', () => {
    const notes = [{ name: 'draft-strategy', content: 'Zero RB until round 5.' }]

    expect(buildCoachPayload('draft', [draft(1)], [], [], notes).notes).toEqual(notes)
  })

  it('summarizes saved memories newest-first in the payload', () => {
    const memory = (index: number): CoachMemory => ({
      id: `memory-${index}`, content: `Insight ${index}`, role: 'assistant', scope: 'draft',
      draftId: 'draft-1', draftName: 'Tuesday mock',
      createdAt: new Date(Date.UTC(2026, 7, index)).toISOString(),
    })

    const payload = buildCoachPayload('draft', [draft(1)], [], [], [], [memory(1), memory(2)])

    expect(payload.memories).toEqual([
      { content: 'Insight 2', role: 'assistant', draftName: 'Tuesday mock', savedAt: '2026-08-02T00:00:00.000Z' },
      { content: 'Insight 1', role: 'assistant', draftName: 'Tuesday mock', savedAt: '2026-08-01T00:00:00.000Z' },
    ])
  })
})

describe('COACH_PRESETS', () => {
  it('offers a draft-scoped grading preset that invokes the playback feature', () => {
    const preset = COACH_PRESETS.draft.find((candidate) => candidate.label === 'Grade my draft')

    expect(preset?.prompt).toContain('give my draft a score out of 100')
    expect(preset?.prompt).toContain('use the playback feature to go through each pick')
  })
})

describe('requestCoach', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('surfaces the Supabase gateway error when the coach runtime is offline', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-anon-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'An unexpected error occurred' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )))

    await expect(requestCoach({ scope: 'draft', drafts: [draft(1)], messages: [
      { role: 'user', content: 'Review my draft.' },
    ], players: [], notes: [], memories: [] })).rejects.toThrow('The coach service is offline. Start it with `npm run coach:serve`.')
  })
})
