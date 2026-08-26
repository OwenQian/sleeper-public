import { describe, expect, it } from 'vitest'
import { loadCoachNotes } from './coachNotes'

describe('loadCoachNotes', () => {
  it('maps markdown files to named notes sorted by filename', () => {
    const notes = loadCoachNotes({
      '../../coach-notes/player-takes.md': 'Fade rookie TEs.\n',
      '../../coach-notes/draft-strategy.md': 'Anchor RB, then hammer WR.',
    })

    expect(notes).toEqual([
      { name: 'draft-strategy', content: 'Anchor RB, then hammer WR.' },
      { name: 'player-takes', content: 'Fade rookie TEs.' },
    ])
  })

  it('skips the README and empty files', () => {
    const notes = loadCoachNotes({
      '../../coach-notes/README.md': 'How to use this directory.',
      '../../coach-notes/empty.md': '   \n',
      '../../coach-notes/league-tendencies.md': 'QBs go early in this league.',
    })

    expect(notes.map((note) => note.name)).toEqual(['league-tendencies'])
  })
})
