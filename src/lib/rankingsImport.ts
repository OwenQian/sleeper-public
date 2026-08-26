import type { Player, Position } from '../types'
import { derivePositionTiers, parseCsvRow, parseRankingsCsv } from './rankings'

const REQUIRED_HEADERS = [
  'Overall',
  'Player',
  'Position',
  'Pos Rank',
  'Tier',
  'Auction (Out of $200)',
] as const

const SUPPORTED_POSITIONS = new Set<Position>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

export interface RankingsImportPreview {
  players: Player[]
  matched: number
  added: number
  retained: number
}

interface RankingsImportOptions {
  preserveEditedRankings: boolean
}

function positiveNumber(value: string): boolean {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

function validAuctionValue(value: string): boolean {
  const number = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(number) && number >= 0
}

function rowError(row: number, field: string): Error {
  return new Error(`CSV row ${row} has an invalid ${field} value.`)
}

export function parseRankingsImport(csv: string): Player[] {
  const normalized = csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const rows = normalized ? normalized.split('\n') : []
  const headers = rows[0] ? parseCsvRow(rows[0]).map((header) => header.trim()) : []

  if (
    headers.length !== REQUIRED_HEADERS.length
    || headers.some((header, index) => header !== REQUIRED_HEADERS[index])
  ) {
    throw new Error(`Required CSV headers, in order: ${REQUIRED_HEADERS.join(', ')}`)
  }
  if (rows.length < 2) {
    throw new Error('The rankings CSV must contain at least one player.')
  }

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const cells = parseCsvRow(row)
    if (cells.length !== REQUIRED_HEADERS.length) throw rowError(rowNumber, 'column count')

    const [overall, name, position, positionRank, tier, auction] = cells.map((cell) => cell.trim())
    if (!positiveNumber(overall)) throw rowError(rowNumber, 'Overall rank')
    if (!name) throw rowError(rowNumber, 'Player name')
    if (!SUPPORTED_POSITIONS.has(position as Position)) throw rowError(rowNumber, 'Position')
    if (!positiveNumber(positionRank)) throw rowError(rowNumber, 'Pos Rank')
    if (!positiveNumber(tier)) throw rowError(rowNumber, 'Tier')
    if (!validAuctionValue(auction)) throw rowError(rowNumber, 'Auction value')
  })

  return derivePositionTiers(parseRankingsCsv(normalized))
}

function overlayRetainedState(imported: Player, current: Player | undefined): Player {
  if (!current) return imported
  return {
    ...imported,
    tags: current.tags,
    note: current.note,
    unavailable: current.unavailable,
    unavailableSource: current.unavailableSource,
    sleeperId: current.sleeperId,
    adp: current.adp,
    team: current.team,
    injuryStatus: current.injuryStatus,
    depthChartOrder: current.depthChartOrder,
    yearsExperience: current.yearsExperience,
  }
}

export function applyRankingsImport(
  currentPlayers: Player[],
  csvPlayers: Player[],
  options: RankingsImportOptions,
): Player[] {
  const orderedCurrent = [...currentPlayers].sort((left, right) => left.rank - right.rank)
  const currentById = new Map(orderedCurrent.map((player) => [player.id, player]))
  const importedIds = new Set(csvPlayers.map((player) => player.id))
  const imported = [...csvPlayers]
    .sort((left, right) => left.rank - right.rank)
    .map((player) => overlayRetainedState(player, currentById.get(player.id)))
  const retained = orderedCurrent.filter((player) => !importedIds.has(player.id))
  let merged = [...imported, ...retained]

  if (options.preserveEditedRankings) {
    const edited = orderedCurrent
      .map((player, ordinal) => ({ player, ordinal }))
      .filter(({ player }) => player.rankingEdited && importedIds.has(player.id))

    if (edited.length > 0) {
      const editedIds = new Set(edited.map(({ player }) => player.id))
      merged = merged.filter((player) => !editedIds.has(player.id))
      edited.forEach(({ player, ordinal }) => {
        const importedPlayer = imported.find((candidate) => candidate.id === player.id)!
        merged.splice(Math.min(ordinal, merged.length), 0, {
          ...importedPlayer,
          overallTier: player.overallTier,
          rankingEdited: true,
        })
      })
    }
  } else {
    merged = merged.map((player) => ({ ...player, rankingEdited: false }))
  }

  return derivePositionTiers(
    merged.map((player, index) => ({ ...player, rank: index + 1 })),
  )
}

export function previewRankingsImport(
  currentPlayers: Player[],
  csvPlayers: Player[],
): RankingsImportPreview {
  const currentIds = new Set(currentPlayers.map((player) => player.id))
  const importedIds = new Set(csvPlayers.map((player) => player.id))
  return {
    players: applyRankingsImport(currentPlayers, csvPlayers, { preserveEditedRankings: true }),
    matched: csvPlayers.filter((player) => currentIds.has(player.id)).length,
    added: csvPlayers.filter((player) => !currentIds.has(player.id)).length,
    retained: currentPlayers.filter((player) => !importedIds.has(player.id)).length,
  }
}
