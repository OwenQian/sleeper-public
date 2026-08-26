import { describe, expect, it } from 'vitest'
import { buildDraftResultsMarkdown, formatRoundPick } from './draftResults'
import type { SleeperPick } from '../types'

describe('formatRoundPick', () => {
  it('formats overall pick 37 as the first pick of round four', () => {
    const pick = { pick_no: 37, round: 4, draft_slot: 12, player_id: 'one' }

    expect(formatRoundPick(pick, 12)).toBe('4.01')
  })
})

describe('buildDraftResultsMarkdown', () => {
  it('preserves draft order and groups picks by round', () => {
    const picks: SleeperPick[] = [
      {
        pick_no: 37,
        round: 4,
        draft_slot: 12,
        player_id: 'two',
        picked_by: 'user-2',
        metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
      },
      {
        pick_no: 1,
        round: 1,
        draft_slot: 1,
        player_id: 'one',
        picked_by: 'user-1',
        metadata: { first_name: 'Bijan', last_name: 'Robinson', position: 'RB' },
      },
    ]

    const markdown = buildDraftResultsMarkdown({
      draftId: 'draft-123',
      picks,
      participantNames: { 'user-1': 'Sam', 'user-2': 'Taylor' },
      teams: 12,
    })

    expect(markdown).toContain('# Sleeper Draft Results')
    expect(markdown).toContain('Draft ID: `draft-123`')
    expect(markdown).toContain('## Round 1')
    expect(markdown).toContain('| 1.01 | 1 | Bijan Robinson | RB | Sam · Slot 1 |')
    expect(markdown).toContain('## Round 4')
    expect(markdown).toContain('| 4.01 | 37 | Josh Allen | QB | Taylor · Slot 12 |')
    expect(markdown.indexOf('Bijan Robinson')).toBeLessThan(markdown.indexOf('Josh Allen'))
  })
})
