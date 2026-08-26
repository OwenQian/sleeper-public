import { describe, expect, it } from 'vitest'
import { buildReplayState } from './draftReplay'
import type { Player, SavedDraft } from '../types'

describe('buildReplayState', () => {
  it('derives player availability from picks through the selected cutoff', () => {
    const draft = {
      picks: [
        { player_id: '101', pick_no: 47, round: 4, draft_slot: 2, metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' } },
        { player_id: '102', pick_no: 48, round: 4, draft_slot: 1, metadata: { first_name: 'Lamar', last_name: 'Jackson', position: 'QB' } },
      ],
    } as SavedDraft
    const players = [
      { id: 'josh', sleeperId: '101', name: 'Josh Allen' },
      { id: 'lamar', sleeperId: '102', name: 'Lamar Jackson' },
      { id: 'bijan', sleeperId: '103', name: 'Bijan Robinson' },
    ] as Player[]

    const replay = buildReplayState(draft, players, 47)

    expect(replay.draftedPicks.map((pick) => pick.player_id)).toEqual(['101'])
    expect(replay.futurePicks.map((pick) => pick.player_id)).toEqual(['102'])
    expect(replay.unavailablePlayers.map((player) => player.name)).toEqual(['Josh Allen'])
    expect(replay.availablePlayers.map((player) => player.name)).toEqual(['Lamar Jackson', 'Bijan Robinson'])
  })
})
