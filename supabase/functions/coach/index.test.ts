import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('coach instructions', () => {
  it('requires draft playback recommendations to consider the available player rankings', () => {
    const source = readFileSync(resolve('supabase/functions/coach/index.ts'), 'utf8')

    expect(source).toContain(
      'Treat rank as the user\'s preferred player order: a lower rank number means the player is ranked more highly.',
    )
    expect(source).toContain(
      'If you recommend a lower-ranked player over a higher-ranked available player, explicitly explain why roster construction or positional value justifies overriding the rankings.',
    )
  })
})
