import type { SleeperPick } from '../types'

export interface DraftResultsOptions {
  draftId: string
  picks: SleeperPick[]
  participantNames: Record<string, string>
  teams: number
}

export function formatRoundPick(pick: SleeperPick, teams: number): string {
  const teamCount = Math.max(1, Math.floor(teams))
  const round = Math.max(1, Math.floor(pick.round))
  const calculated = pick.pick_no - ((round - 1) * teamCount)
  const pickInRound = calculated >= 1 && calculated <= teamCount
    ? calculated
    : ((Math.max(1, pick.pick_no) - 1) % teamCount) + 1
  return `${round}.${String(pickInRound).padStart(2, '0')}`
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

function playerName(pick: SleeperPick): string {
  return `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim()
    || pick.player_id
}

function drafter(pick: SleeperPick, participantNames: Record<string, string>): string {
  const name = pick.picked_by
    ? participantNames[pick.picked_by] ?? 'Manager'
    : 'CPU'
  return `${name} · Slot ${pick.draft_slot}`
}

export function buildDraftResultsMarkdown({
  draftId,
  picks,
  participantNames,
  teams,
}: DraftResultsOptions): string {
  const lines = [
    '# Sleeper Draft Results',
    '',
    `Draft ID: \`${draftId}\``,
    '',
  ]
  const ordered = [...picks].sort((left, right) => left.pick_no - right.pick_no)
  const rounds = new Map<number, SleeperPick[]>()
  ordered.forEach((pick) => {
    rounds.set(pick.round, [...(rounds.get(pick.round) ?? []), pick])
  })

  rounds.forEach((roundPicks, round) => {
    lines.push(
      `## Round ${round}`,
      '',
      '| Pick | Overall | Player | Pos | Drafted by |',
      '| --- | ---: | --- | --- | --- |',
    )
    roundPicks.forEach((pick) => {
      lines.push(`| ${formatRoundPick(pick, teams)} | ${pick.pick_no} | ${escapeMarkdownCell(playerName(pick))} | ${escapeMarkdownCell(pick.metadata?.position ?? '—')} | ${escapeMarkdownCell(drafter(pick, participantNames))} |`)
    })
    lines.push('')
  })

  if (ordered.length === 0) lines.push('No picks recorded.', '')
  return `${lines.join('\n').trimEnd()}\n`
}
