import type { Player, Position, PositionFilter } from '../types'

const FLEX_POSITIONS = new Set<Position>(['RB', 'WR', 'TE'])

export interface DraftPickGroup {
  label: string
  round: number | null
  slot: number | null
  overallPick: number | null
  players: Player[]
}

function parseCsvRow(row: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]
    if (character === '"' && quoted && row[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }

  cells.push(cell)
  return cells
}

function makeId(name: string, position: string): string {
  return `${name}-${position}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function parseRankingsCsv(csv: string): Player[] {
  const rows = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  return rows.slice(1).map((row) => {
    const [overall, name, position, positionRank, tier, auction] = parseCsvRow(row)
    return {
      id: makeId(name, position),
      name,
      position: position as Position,
      sourcePositionRank: Number(positionRank),
      sourceRank: Number(overall),
      sourceOverallTier: Number(tier),
      rank: Number(overall),
      overallTier: Number(tier),
      positionTier: 1,
      auctionValue: Number(auction.replace(/[^\d.]/g, '')),
      tags: [],
      unavailable: false,
    }
  })
}

export function derivePositionTiers(players: Player[]): Player[] {
  const tierByPosition = new Map<Position, { sourceTier: number; tier: number }>()

  return [...players]
    .sort((left, right) => left.rank - right.rank)
    .map((player) => {
      const previous = tierByPosition.get(player.position)
      const positionTier = !previous
        ? 1
        : previous.sourceTier === player.overallTier
          ? previous.tier
          : previous.tier + 1

      tierByPosition.set(player.position, {
        sourceTier: player.overallTier,
        tier: positionTier,
      })

      return { ...player, positionTier }
    })
}

export function deriveFlexTiers(players: Player[]): Map<string, number> {
  const result = new Map<string, number>()
  let previousOverallTier: number | undefined
  let flexTier = 0

  players
    .filter((player) => FLEX_POSITIONS.has(player.position))
    .sort((left, right) => left.rank - right.rank)
    .forEach((player) => {
      if (previousOverallTier !== player.overallTier) {
        flexTier += 1
        previousOverallTier = player.overallTier
      }
      result.set(player.id, flexTier)
    })

  return result
}

export function filterPlayers(
  players: Player[],
  options: { position: PositionFilter; hideUnavailable: boolean; query?: string },
): Player[] {
  const normalizedQuery = options.query?.trim().toLowerCase()

  return players.filter((player) => {
    if (options.hideUnavailable && player.unavailable) return false
    if (options.position === 'FLEX' && !FLEX_POSITIONS.has(player.position)) return false
    if (options.position !== 'ALL' && options.position !== 'FLEX' && player.position !== options.position) {
      return false
    }
    if (normalizedQuery && !`${player.name} ${player.team ?? ''}`.toLowerCase().includes(normalizedQuery)) {
      return false
    }
    return true
  })
}

export function groupPlayersByDraftPick(
  players: Player[],
  options: { teams: number; draftSlot: number; rounds: number },
): DraftPickGroup[] {
  const teams = Math.max(2, Math.floor(options.teams))
  const draftSlot = Math.min(teams, Math.max(1, Math.floor(options.draftSlot)))
  const rounds = Math.max(1, Math.floor(options.rounds))
  const picks = Array.from({ length: rounds }, (_, index) => {
    const round = index + 1
    const slot = round % 2 === 1 ? draftSlot : teams - draftSlot + 1
    return {
      label: `${round}.${String(slot).padStart(2, '0')}`,
      round,
      slot,
      overallPick: (round - 1) * teams + slot,
    }
  })
  const grouped = new Map<number, Player[]>()
  const unranked: Player[] = []

  players.forEach((player) => {
    if (typeof player.adp !== 'number' || player.adp >= 900) {
      unranked.push(player)
      return
    }
    const adp = player.adp
    const pick = [...picks].reverse().find((candidate) => candidate.overallPick <= adp) ?? picks[0]
    grouped.set(pick.overallPick, [...(grouped.get(pick.overallPick) ?? []), player])
  })

  const groups: DraftPickGroup[] = picks
    .filter((pick) => grouped.has(pick.overallPick))
    .map((pick) => ({
      ...pick,
      players: grouped.get(pick.overallPick)!
        .sort((left, right) => (left.adp ?? Number.POSITIVE_INFINITY) - (right.adp ?? Number.POSITIVE_INFINITY)),
    }))

  if (unranked.length > 0) {
    groups.push({
      label: 'No Sleeper ADP',
      round: null,
      slot: null,
      overallPick: null,
      players: unranked,
    })
  }
  return groups
}

export function sortPlayersByAdp(players: Player[]): Player[] {
  const sortableAdp = (player: Player) =>
    typeof player.adp === 'number' && Number.isFinite(player.adp) && player.adp > 0 && player.adp < 900
      ? player.adp
      : Number.POSITIVE_INFINITY

  return [...players].sort((left, right) =>
    sortableAdp(left) - sortableAdp(right) || left.rank - right.rank,
  )
}

export function movePlayer(players: Player[], movingId: string, targetId: string): Player[] {
  if (movingId === targetId) return players
  const ordered = [...players].sort((left, right) => left.rank - right.rank)
  const movingIndex = ordered.findIndex((player) => player.id === movingId)
  const targetIndex = ordered.findIndex((player) => player.id === targetId)
  if (movingIndex < 0 || targetIndex < 0) return players

  const [moving] = ordered.splice(movingIndex, 1)
  const newTargetIndex = ordered.findIndex((player) => player.id === targetId)
  const targetTier = ordered[newTargetIndex].overallTier
  ordered.splice(newTargetIndex, 0, { ...moving, overallTier: targetTier })

  return derivePositionTiers(
    ordered.map((player, index) => ({ ...player, rank: index + 1 })),
  )
}

export function movePlayerWithinTier(
  players: Player[],
  playerId: string,
  direction: 'up' | 'down',
  candidateIds?: string[],
): Player[] {
  const ordered = [...players].sort((left, right) => left.rank - right.rank)
  const currentIndex = ordered.findIndex((player) => player.id === playerId)
  if (currentIndex < 0) return players

  const candidates = candidateIds ?? ordered
    .filter((player) => player.overallTier === ordered[currentIndex].overallTier)
    .map((player) => player.id)
  const candidateIndex = candidates.indexOf(playerId)
  const targetId = candidates[candidateIndex + (direction === 'up' ? -1 : 1)]
  if (!targetId) return players
  const targetIndex = ordered.findIndex((player) => player.id === targetId)
  if (targetIndex < 0) return players
  if (ordered[targetIndex].overallTier !== ordered[currentIndex].overallTier) return players

  const current = ordered[currentIndex]
  ordered[currentIndex] = ordered[targetIndex]
  ordered[targetIndex] = current
  return derivePositionTiers(
    ordered.map((player, index) => ({ ...player, rank: index + 1 })),
  )
}

export function movePlayerToTier(players: Player[], movingId: string, tier: number): Player[] {
  const ordered = [...players].sort((left, right) => left.rank - right.rank)
  const movingIndex = ordered.findIndex((player) => player.id === movingId)
  if (movingIndex < 0) return players
  const [moving] = ordered.splice(movingIndex, 1)
  const firstAfterTier = ordered.findIndex((player) => player.overallTier > tier)
  const insertAt = firstAfterTier < 0 ? ordered.length : firstAfterTier
  ordered.splice(insertAt, 0, { ...moving, overallTier: tier })
  return derivePositionTiers(ordered.map((player, index) => ({ ...player, rank: index + 1 })))
}

export function resetPlayerRanking(players: Player[], playerId: string): Player[] {
  const ordered = [...players].sort((left, right) => left.rank - right.rank)
  const currentIndex = ordered.findIndex((player) => player.id === playerId)
  if (currentIndex < 0) return players

  const [player] = ordered.splice(currentIndex, 1)
  if (player.sourceRank === undefined || player.sourceOverallTier === undefined) return players
  const insertAt = Math.min(ordered.length, Math.max(0, player.sourceRank - 1))
  ordered.splice(insertAt, 0, {
    ...player,
    overallTier: player.sourceOverallTier,
    rankingEdited: false,
  })

  return derivePositionTiers(
    ordered.map((candidate, index) => ({ ...candidate, rank: index + 1 })),
  )
}

export interface ResetSelection {
  rankings: boolean
  tags: boolean
  all: boolean
}

export function resetPlayers(players: Player[], selection: ResetSelection): Player[] {
  let reset: Player[] = players.map((player) => ({
    ...player,
    tags: selection.tags || selection.all ? [] : player.tags,
    note: selection.all ? undefined : player.note,
    unavailable: selection.all ? false : player.unavailable,
    unavailableSource: selection.all ? undefined : player.unavailableSource,
  }))

  if (selection.rankings || selection.all) {
    reset = reset
      .sort((left, right) => {
        if (left.sourceRank !== undefined && right.sourceRank !== undefined) {
          return left.sourceRank - right.sourceRank
        }
        if (left.sourceRank !== undefined) return -1
        if (right.sourceRank !== undefined) return 1
        return left.rank - right.rank
      })
      .map((player, index) => ({
        ...player,
        rank: index + 1,
        overallTier: player.sourceOverallTier ?? player.overallTier,
        rankingEdited: false,
      }))
    reset = derivePositionTiers(reset)
  }

  return reset
}
