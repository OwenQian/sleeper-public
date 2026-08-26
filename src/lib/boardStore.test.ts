import { describe, expect, it } from 'vitest'
import { resolveBoardId } from './boardStore'

describe('resolveBoardId', () => {
  it('scopes the default id to league and manager', () => {
    expect(resolveBoardId({ leagueId: '123', userId: '456' })).toBe('123:456')
    expect(resolveBoardId({ leagueId: '123' })).toBe('123:anonymous')
    expect(resolveBoardId({})).toBe('default')
  })
})
