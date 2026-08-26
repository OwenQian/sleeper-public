import type { Player, SavedDraft, SleeperPick } from '../types'

export interface DraftReplayState {
  draftedPicks: SleeperPick[]
  futurePicks: SleeperPick[]
  availablePlayers: Player[]
  unavailablePlayers: Player[]
}

function normalizeName(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
}

function pickName(pick: SleeperPick): string {
  return `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim()
}

export function buildReplayState(
  draft: SavedDraft,
  players: Player[],
  cutoffPickNo = Number.POSITIVE_INFINITY,
): DraftReplayState {
  const ordered = [...draft.picks].sort((left, right) => left.pick_no - right.pick_no)
  const draftedPicks = ordered.filter((pick) => pick.pick_no <= cutoffPickNo)
  const futurePicks = ordered.filter((pick) => pick.pick_no > cutoffPickNo)
  const draftedIds = new Set(draftedPicks.map((pick) => pick.player_id))
  const draftedNames = new Set(draftedPicks.map((pick) => normalizeName(pickName(pick))).filter(Boolean))
  const unavailablePlayers = players.filter((player) =>
    (player.sleeperId && draftedIds.has(player.sleeperId)) || draftedNames.has(normalizeName(player.name)),
  )
  const unavailableIds = new Set(unavailablePlayers.map((player) => player.id))
  const availablePlayers = players.filter((player) => !unavailableIds.has(player.id))

  return { draftedPicks, futurePicks, availablePlayers, unavailablePlayers }
}
