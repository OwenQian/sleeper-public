import { describe, expect, it } from 'vitest'
import { buildGuideNoteLookup, guidePlayerNote } from './guidePlayerNotes'

describe('buildGuideNoteLookup', () => {
  it('matches player names ignoring case, punctuation, and accents', () => {
    const lookup = buildGuideNoteLookup({ "De'Von Achane": 'Explosive receiving back.' })

    expect(lookup('devon achane')).toBe('Explosive receiving back.')
    expect(lookup('DE VON ACHANE')).toBe('Explosive receiving back.')
  })

  it('matches player names ignoring generational suffixes', () => {
    const lookup = buildGuideNoteLookup({ 'Kenneth Walker': 'Explosive rushing profile.' })

    expect(lookup('Kenneth Walker III')).toBe('Explosive rushing profile.')
    expect(lookup('Kenneth Walker Jr.')).toBe('Explosive rushing profile.')
  })

  it('returns undefined for players without a note', () => {
    const lookup = buildGuideNoteLookup({})

    expect(lookup('Jahmyr Gibbs')).toBeUndefined()
  })
})

describe('guidePlayerNote', () => {
  it('never throws when the private notes file is absent', () => {
    expect(guidePlayerNote('Player Who Does Not Exist')).toBeUndefined()
  })
})
