import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import {
  applyRankingsImport,
  parseRankingsImport,
  previewRankingsImport,
} from './rankingsImport'

const header = 'Overall,Player,Position,Pos Rank,Tier,Auction (Out of $200)'
const sourceCsv = `${header}
1,Alpha Runner,RB,1,1,$60
2,Beta Catcher,WR,1,2,$52
3,Gamma Passer,QB,1,3,$35`

describe('parseRankingsImport', () => {
  it('returns typed players from a valid CSV with a BOM and Windows line endings', () => {
    const players = parseRankingsImport(`\uFEFF${sourceCsv.replace(/\n/g, '\r\n')}`)

    expect(players).toHaveLength(3)
    expect(players[1]).toMatchObject({
      id: 'beta-catcher-wr',
      name: 'Beta Catcher',
      position: 'WR',
      sourcePositionRank: 1,
      sourceRank: 2,
      sourceOverallTier: 2,
      rank: 2,
      overallTier: 2,
      positionTier: 1,
      auctionValue: 52,
    })
  })

  it.each([
    ['missing', 'Overall,Player,Position,Pos Rank,Tier'],
    ['reordered', 'Player,Overall,Position,Pos Rank,Tier,Auction (Out of $200)'],
  ])('rejects a %s required header', (_description, invalidHeader) => {
    expect(() => parseRankingsImport(`${invalidHeader}\n1,Alpha Runner,RB,1,1,$60`))
      .toThrow('Required CSV headers')
  })

  it.each([
    ['rank', `not-a-number,Alpha Runner,RB,1,1,$60`, 'Overall'],
    ['position rank', `1,Alpha Runner,RB,zero,1,$60`, 'Pos Rank'],
    ['tier', `1,Alpha Runner,RB,1,0,$60`, 'Tier'],
    ['auction value', `1,Alpha Runner,RB,1,1,unknown`, 'Auction'],
    ['position', `1,Alpha Runner,LS,1,1,$60`, 'Position'],
    ['name', `1,,RB,1,1,$60`, 'Player'],
  ])('identifies the row containing an invalid %s', (_description, row, field) => {
    expect(() => parseRankingsImport(`${header}\n${row}`))
      .toThrow(new RegExp(`row 2.*${field}`, 'i'))
  })

  it('requires at least one player row', () => {
    expect(() => parseRankingsImport(header)).toThrow('at least one player')
  })
})

describe('rankings import merge', () => {
  const currentPlayers = (): Player[] => {
    const [alpha, beta, gamma] = parseRankingsImport(sourceCsv)
    return [
      {
        ...beta,
        rank: 1,
        overallTier: 7,
        rankingEdited: true,
        tags: ['target'],
        note: 'My favorite',
        unavailable: true,
        unavailableSource: 'manual',
        sleeperId: 'sleeper-beta',
        adp: 11.5,
        team: 'SEA',
        injuryStatus: 'Questionable',
        depthChartOrder: 1,
        yearsExperience: 3,
      },
      { ...alpha, rank: 2 },
      { ...gamma, id: 'legacy-kicker-k', name: 'Legacy Kicker', position: 'K', rank: 3 },
    ]
  }

  const incomingPlayers = () => parseRankingsImport(`${header}
1,Alpha Runner,RB,1,1,$65
2,Delta Tight End,TE,1,2,$31
3,Beta Catcher,WR,2,4,$44`)

  it('previews matching, added, and retained players', () => {
    const preview = previewRankingsImport(currentPlayers(), incomingPlayers())

    expect(preview).toMatchObject({ matched: 2, added: 1, retained: 1 })
    expect(preview.players).toHaveLength(4)
  })

  it('safely imports source data while retaining edits, annotations, and missing players', () => {
    const result = applyRankingsImport(currentPlayers(), incomingPlayers(), {
      preserveEditedRankings: true,
    })

    expect(result.map((player) => player.name)).toEqual([
      'Beta Catcher',
      'Alpha Runner',
      'Delta Tight End',
      'Legacy Kicker',
    ])
    expect(result.map((player) => player.rank)).toEqual([1, 2, 3, 4])
    expect(result[0]).toMatchObject({
      sourceRank: 3,
      sourcePositionRank: 2,
      sourceOverallTier: 4,
      auctionValue: 44,
      overallTier: 7,
      rankingEdited: true,
      tags: ['target'],
      note: 'My favorite',
      unavailable: true,
      unavailableSource: 'manual',
      sleeperId: 'sleeper-beta',
      adp: 11.5,
      team: 'SEA',
      injuryStatus: 'Questionable',
      depthChartOrder: 1,
      yearsExperience: 3,
    })
    expect(result.at(-1)?.name).toBe('Legacy Kicker')
  })

  it('reloads source ordering while retaining annotations and availability', () => {
    const result = applyRankingsImport(currentPlayers(), incomingPlayers(), {
      preserveEditedRankings: false,
    })

    expect(result.map((player) => player.name)).toEqual([
      'Alpha Runner',
      'Delta Tight End',
      'Beta Catcher',
      'Legacy Kicker',
    ])
    expect(result.map((player) => player.rank)).toEqual([1, 2, 3, 4])
    expect(result[2]).toMatchObject({
      overallTier: 4,
      rankingEdited: false,
      tags: ['target'],
      note: 'My favorite',
      unavailable: true,
      unavailableSource: 'manual',
    })
  })
})
