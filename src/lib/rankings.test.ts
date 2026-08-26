import { describe, expect, it } from 'vitest'
import {
  derivePositionTiers,
  filterPlayers,
  groupPlayersByDraftPick,
  hydrateGuideNotes,
  movePlayer,
  movePlayerWithinTier,
  parseRankingsCsv,
  resetPlayers,
  resetPlayerRanking,
  sortPlayersByAdp,
} from './rankings'
import { buildGuideNoteLookup } from './guidePlayerNotes'
import type { Player } from '../types'

const csv = `Overall,Player,Position,Pos Rank,Tier,Auction (Out of $200)
1,Jahmyr Gibbs,RB,1,1,$63
2,Ja'Marr Chase,WR,1,2,$59
3,Puka Nacua,WR,2,2,$58
4,Josh Allen,QB,1,8,$29
5,Lamar Jackson,QB,2,11,$17`

const guideNoteFixture = {
  'Jahmyr Gibbs': 'Sample guide note: workhorse back in a fast offense.',
  'Lamar Jackson': 'Sample guide note: dual-threat quarterback with a high weekly floor.',
}

const makePlayers = (): Player[] => parseRankingsCsv(csv, buildGuideNoteLookup(guideNoteFixture))

describe('parseRankingsCsv', () => {
  it('turns source rows into typed draft players', () => {
    const players = makePlayers()

    expect(players).toHaveLength(5)
    expect(players[1]).toMatchObject({
      name: "Ja'Marr Chase",
      position: 'WR',
      rank: 2,
      overallTier: 2,
      auctionValue: 59,
    })
  })

  it('pre-populates guide notes for players covered by the draft guide', () => {
    const [gibbs] = makePlayers()

    expect(gibbs.note).toBe(guideNoteFixture['Jahmyr Gibbs'])
    expect(gibbs.sourceNote).toBe(gibbs.note)
  })
})

describe('hydrateGuideNotes', () => {
  const lookup = buildGuideNoteLookup(guideNoteFixture)
  const legacyPlayer = (overrides: Partial<Player>): Player => ({
    ...makePlayers()[0],
    note: undefined,
    sourceNote: undefined,
    noteEdited: undefined,
    ...overrides,
  })

  it('fills blank unedited notes with the guide note and attaches sourceNote', () => {
    const [missing, blank] = hydrateGuideNotes([
      legacyPlayer({}),
      legacyPlayer({ note: '' }),
    ], lookup)

    expect(missing.note).toBe(guideNoteFixture['Jahmyr Gibbs'])
    expect(blank.note).toBe(guideNoteFixture['Jahmyr Gibbs'])
    expect(blank.sourceNote).toBe(blank.note)
  })

  it('keeps intentionally cleared and user-written notes', () => {
    const [cleared, custom] = hydrateGuideNotes([
      legacyPlayer({ note: '', noteEdited: true }),
      legacyPlayer({ note: 'My own take', noteEdited: true }),
    ], lookup)

    expect(cleared.note).toBe('')
    expect(custom.note).toBe('My own take')
  })

  it('refreshes notes that still match their stored source note', () => {
    const [player] = hydrateGuideNotes([
      legacyPlayer({ note: 'Old guide text', sourceNote: 'Old guide text' }),
    ], lookup)

    expect(player.note).toBe(guideNoteFixture['Jahmyr Gibbs'])
  })
})

describe('derivePositionTiers', () => {
  it('starts each position at tier one while preserving overall tiers', () => {
    const players = derivePositionTiers(makePlayers())

    expect(players.find((player) => player.name === 'Josh Allen')).toMatchObject({
      overallTier: 8,
      positionTier: 1,
    })
    expect(players.find((player) => player.name === 'Lamar Jackson')?.positionTier).toBe(2)
    expect(players.find((player) => player.name === 'Puka Nacua')?.positionTier).toBe(1)
  })
})

describe('filterPlayers', () => {
  it('hides unavailable players by default and treats FLEX as RB, WR, or TE', () => {
    const players = makePlayers().map((player) => ({
      ...player,
      unavailable: player.name === 'Puka Nacua',
    }))

    expect(filterPlayers(players, { position: 'FLEX', hideUnavailable: true }).map((p) => p.name))
      .toEqual(['Jahmyr Gibbs', "Ja'Marr Chase"])
    expect(filterPlayers(players, { position: 'WR', hideUnavailable: false })).toHaveLength(2)
  })
})

describe('movePlayer', () => {
  it('moves a player before the drop target and adopts that tier', () => {
    const players = makePlayers()
    const moved = movePlayer(players, players[4].id, players[1].id)

    expect(moved.map((player) => player.name)).toEqual([
      'Jahmyr Gibbs',
      'Lamar Jackson',
      "Ja'Marr Chase",
      'Puka Nacua',
      'Josh Allen',
    ])
    expect(moved[1].overallTier).toBe(2)
    expect(moved.map((player) => player.rank)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('movePlayerWithinTier', () => {
  it('moves one place within the current tier without crossing a tier boundary', () => {
    const players = makePlayers()

    const movedDown = movePlayerWithinTier(players, players[1].id, 'down')
    expect(movedDown.map((player) => player.name)).toEqual([
      'Jahmyr Gibbs',
      'Puka Nacua',
      "Ja'Marr Chase",
      'Josh Allen',
      'Lamar Jackson',
    ])
    expect(movedDown.map((player) => player.overallTier)).toEqual([1, 2, 2, 8, 11])

    expect(movePlayerWithinTier(players, players[1].id, 'up')).toBe(players)
  })

  it('moves against the adjacent visible player when the board is filtered', () => {
    const [gibbs, chase, puka] = makePlayers()
    const players = [
      { ...chase, id: 'wr-one', name: 'WR One', rank: 1, overallTier: 2 },
      { ...gibbs, id: 'rb-one', name: 'RB One', rank: 2, overallTier: 2 },
      { ...puka, id: 'wr-two', name: 'WR Two', rank: 3, overallTier: 2 },
    ]

    const moved = movePlayerWithinTier(players, 'wr-two', 'up', ['wr-one', 'wr-two'])

    expect(moved.map((player) => player.id)).toEqual(['wr-two', 'rb-one', 'wr-one'])
  })
})

describe('resetPlayerRanking', () => {
  it('returns an edited player to its source rank and tier', () => {
    const source = makePlayers()
    const moved = movePlayer(source, source[4].id, source[1].id)
      .map((player) => player.id === source[4].id ? { ...player, rankingEdited: true } : player)

    const reset = resetPlayerRanking(moved, source[4].id)

    expect(reset.map((player) => player.name)).toEqual(source.map((player) => player.name))
    expect(reset[4]).toMatchObject({ rank: 5, overallTier: 11, rankingEdited: false })
  })
})

describe('resetPlayers', () => {
  const editedPlayers = () => {
    const source = makePlayers()
    return movePlayer(source, source[4].id, source[1].id).map((player) =>
      player.id === source[4].id
        ? {
            ...player,
            tags: ['target'] as Player['tags'],
            note: 'Keep me',
            unavailable: true,
            unavailableSource: 'manual' as const,
            rankingEdited: true,
          }
        : player,
    )
  }

  it('resets rankings while preserving tags, notes, and availability', () => {
    const reset = resetPlayers(editedPlayers(), {
      rankings: true,
      tags: false,
      notes: false,
      availability: false,
      all: false,
    })
    const lamar = reset.find((player) => player.name === 'Lamar Jackson')!

    expect(reset.map((player) => player.name)).toEqual(makePlayers().map((player) => player.name))
    expect(lamar).toMatchObject({ tags: ['target'], note: 'Keep me', unavailable: true, rankingEdited: false })
  })

  it('resets tags without changing rankings or other personal state', () => {
    const edited = editedPlayers()
    const reset = resetPlayers(edited, {
      rankings: false,
      tags: true,
      notes: false,
      availability: false,
      all: false,
    })
    const lamar = reset.find((player) => player.name === 'Lamar Jackson')!

    expect(reset.map((player) => player.name)).toEqual(edited.map((player) => player.name))
    expect(lamar).toMatchObject({ tags: [], note: 'Keep me', unavailable: true, rankingEdited: true })
  })

  it('resets notes without changing rankings or other personal state', () => {
    const edited = editedPlayers()
    const reset = resetPlayers(edited, {
      rankings: false,
      tags: false,
      notes: true,
      availability: false,
      all: false,
    })
    const lamar = reset.find((player) => player.name === 'Lamar Jackson')!

    expect(reset.map((player) => player.name)).toEqual(edited.map((player) => player.name))
    expect(lamar).toMatchObject({ tags: ['target'], unavailable: true, rankingEdited: true })
    expect(lamar.note).toBe(lamar.sourceNote)
  })

  it('resets availability without changing rankings or other personal state', () => {
    const edited = editedPlayers()
    const reset = resetPlayers(edited, {
      rankings: false,
      tags: false,
      notes: false,
      availability: true,
      all: false,
    })
    const lamar = reset.find((player) => player.name === 'Lamar Jackson')!

    expect(reset.map((player) => player.name)).toEqual(edited.map((player) => player.name))
    expect(lamar).toMatchObject({ tags: ['target'], note: 'Keep me', unavailable: false, rankingEdited: true })
    expect(lamar.unavailableSource).toBeUndefined()
  })

  it('resets all personal state and rankings', () => {
    const reset = resetPlayers(editedPlayers(), {
      rankings: false,
      tags: false,
      notes: false,
      availability: false,
      all: true,
    })
    const lamar = reset.find((player) => player.name === 'Lamar Jackson')!

    expect(reset.map((player) => player.name)).toEqual(makePlayers().map((player) => player.name))
    expect(lamar).toMatchObject({ tags: [], unavailable: false, rankingEdited: false })
    expect(lamar.note).toBe(lamar.sourceNote)
    expect(lamar.unavailableSource).toBeUndefined()
  })

  it('restores a pre-populated guide note during a full reset', () => {
    const players = makePlayers().map((player) =>
      player.name === 'Jahmyr Gibbs' ? { ...player, note: 'My edited note' } : player,
    )

    const reset = resetPlayers(players, { rankings: false, tags: false, notes: false, availability: false, all: true })
    const gibbs = reset.find((player) => player.name === 'Jahmyr Gibbs')!

    expect(gibbs.note).toBe(gibbs.sourceNote)
    expect(gibbs.note).toBe(guideNoteFixture['Jahmyr Gibbs'])
  })
})

describe('groupPlayersByDraftPick', () => {
  it('builds slot two snake-draft windows at picks 2, 23, 26, and 47', () => {
    const players = [
      { ...makePlayers()[0], id: 'one', adp: 1.2 },
      { ...makePlayers()[1], id: 'two', adp: 12 },
      { ...makePlayers()[2], id: 'three', adp: 23.8 },
      { ...makePlayers()[3], id: 'four', adp: 30 },
      { ...makePlayers()[4], id: 'five', adp: 52 },
    ]

    const groups = groupPlayersByDraftPick(players, { teams: 12, draftSlot: 2, rounds: 5 })

    expect(groups.map((group) => [group.label, group.overallPick])).toEqual([
      ['1.02', 2],
      ['2.11', 23],
      ['3.02', 26],
      ['5.02', 50],
    ])
    expect(groups.map((group) => group.players.map((player) => player.id))).toEqual([
      ['one', 'two'],
      ['three'],
      ['four'],
      ['five'],
    ])
  })

  it('keeps players without Sleeper ADP in an explicit unranked group', () => {
    const groups = groupPlayersByDraftPick(makePlayers(), { teams: 12, draftSlot: 2, rounds: 2 })

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ label: 'No Sleeper ADP', overallPick: null })
  })
})

describe('sortPlayersByAdp', () => {
  it('sorts valid Sleeper ADPs first and keeps unranked players in board order', () => {
    const players = makePlayers().map((player, index) => ({
      ...player,
      adp: [undefined, 24, 2, 900, 15][index],
    }))

    const sorted = sortPlayersByAdp(players)

    expect(sorted.map((player) => player.name)).toEqual([
      'Puka Nacua',
      'Lamar Jackson',
      "Ja'Marr Chase",
      'Jahmyr Gibbs',
      'Josh Allen',
    ])
    expect(players[0].name).toBe('Jahmyr Gibbs')
  })
})
