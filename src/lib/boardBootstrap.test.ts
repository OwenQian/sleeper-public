import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import { buildGuideNoteLookup } from './guidePlayerNotes'
import { parseRankingsImport } from './rankingsImport'
import {
  BOARD_STORAGE_KEY,
  readLocalBoardSnapshot,
  selectInitialBoard,
} from './boardBootstrap'

const bundledCsv = `Overall,Player,Position,Pos Rank,Tier,Auction (Out of $200)
1,Bundled Player,RB,1,1,$50`

const persistedPlayer: Player = {
  id: 'persisted-player-wr',
  name: 'Persisted Player',
  position: 'WR',
  sourcePositionRank: 7,
  sourceRank: 7,
  sourceOverallTier: 3,
  rank: 1,
  overallTier: 8,
  positionTier: 1,
  auctionValue: 21,
  tags: ['target'],
  unavailable: false,
  rankingEdited: true,
}

describe('selectInitialBoard', () => {
  it('keeps persisted players instead of merging bundled rankings', () => {
    const persisted = { players: [persistedPlayer] }

    const selected = selectInitialBoard(persisted, bundledCsv)

    expect(selected.players).toEqual([persistedPlayer])
  })

  it('hydrates guide notes onto persisted players with blank unedited notes', () => {
    const legacyGibbs: Player = {
      ...persistedPlayer,
      id: 'jahmyr-gibbs-rb',
      name: 'Jahmyr Gibbs',
      position: 'RB',
      note: '',
    }
    const lookup = buildGuideNoteLookup({ 'Jahmyr Gibbs': 'Sample guide note for Gibbs.' })

    const selected = selectInitialBoard({ players: [legacyGibbs] }, bundledCsv, lookup)

    expect(selected.players[0].note).toBe('Sample guide note for Gibbs.')
    expect(selected.players[0].sourceNote).toBe(selected.players[0].note)
  })

  it('seeds from a valid bundled CSV when no snapshot exists', () => {
    expect(selectInitialBoard(null, bundledCsv).players)
      .toEqual(parseRankingsImport(bundledCsv))
  })

  it.each(['', 'not,csv'])('returns an empty board for an absent or malformed bundled CSV', (csv) => {
    expect(selectInitialBoard(null, csv)).toEqual({ players: [] })
  })

  it('does not require a bundled rankings source', () => {
    expect(selectInitialBoard(null)).toEqual({ players: [] })
  })
})

describe('readLocalBoardSnapshot', () => {
  it('reads a legacy player-array snapshot without merging later bundled changes', () => {
    const storage = {
      getItem: (key: string) => key === BOARD_STORAGE_KEY
        ? JSON.stringify([persistedPlayer])
        : null,
    }

    const stored = readLocalBoardSnapshot(storage)
    const selected = selectInitialBoard(stored, bundledCsv)

    expect(selected.players).toEqual([persistedPlayer])
  })

  it('recovers from malformed local storage', () => {
    const storage = { getItem: () => '{broken' }

    expect(readLocalBoardSnapshot(storage)).toBeNull()
    expect(selectInitialBoard(readLocalBoardSnapshot(storage), bundledCsv).players[0].name)
      .toBe('Bundled Player')
  })
})
