import { describe, expect, it } from 'vitest'
import { readDraftConfigEnv } from './draftConfig'

describe('readDraftConfigEnv', () => {
  it('uses explicit draft settings from environment variables', () => {
    expect(readDraftConfigEnv({
      VITE_DRAFT_LEAGUE_SIZE: '14',
      VITE_DRAFT_SLOT: '9',
      VITE_SLEEPER_LEAGUE_ID: ' league-1 ',
    })).toEqual({
      leagueSize: 14,
      draftSlot: 9,
      leagueId: 'league-1',
    })
  })

  it('uses safe defaults for omitted or invalid optional settings', () => {
    expect(readDraftConfigEnv({})).toEqual({
      leagueSize: 12,
      draftSlot: 1,
      leagueId: null,
    })
    expect(readDraftConfigEnv({
      VITE_DRAFT_LEAGUE_SIZE: 'zero',
      VITE_DRAFT_SLOT: '99',
      VITE_SLEEPER_LEAGUE_ID: ' ',
    })).toEqual({
      leagueSize: 12,
      draftSlot: 12,
      leagueId: null,
    })
  })
})
