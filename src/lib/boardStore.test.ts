import { describe, expect, it } from 'vitest'
import { mergeStoredPlayers, resolveBoardId } from './boardStore'
import type { Player } from '../types'

const player = (overrides: Partial<Player>): Player => ({
  id: 'jahmyr-gibbs-rb',
  name: 'Jahmyr Gibbs',
  position: 'RB',
  sourcePositionRank: 1,
  rank: 1,
  overallTier: 1,
  positionTier: 1,
  auctionValue: 63,
  tags: [],
  unavailable: false,
  ...overrides,
})

describe('resolveBoardId', () => {
  it('scopes the default id to league and manager', () => {
    expect(resolveBoardId({ leagueId: '123', userId: '456' })).toBe('123:456')
    expect(resolveBoardId({ leagueId: '123' })).toBe('123:anonymous')
    expect(resolveBoardId({})).toBe('default')
  })
})

describe('mergeStoredPlayers', () => {
  it('restores personal state and order while accepting new source players', () => {
    const source = [
      player({ id: 'gibbs', name: 'Jahmyr Gibbs', rank: 1 }),
      player({ id: 'bijan', name: 'Bijan Robinson', rank: 2 }),
      player({ id: 'chase', name: "Ja'Marr Chase", position: 'WR', rank: 3 }),
    ]
    const stored = [
      player({ id: 'bijan', name: 'Bijan Robinson', rank: 1, tags: ['target'], note: 'My guy' }),
      player({ id: 'gibbs', name: 'Jahmyr Gibbs', rank: 2 }),
      player({ id: 'aubrey-k', name: 'Brandon Aubrey', position: 'K', rank: 3, sleeperId: '11533' }),
    ]

    const result = mergeStoredPlayers(source, stored)

    expect(result.map((candidate) => candidate.id)).toEqual(['bijan', 'gibbs', 'aubrey-k', 'chase'])
    expect(result[0]).toMatchObject({ tags: ['target'], note: 'My guy' })
    expect(result.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4])
  })
})
