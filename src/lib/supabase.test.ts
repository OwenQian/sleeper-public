import { describe, expect, it, vi } from 'vitest'
import { resolveBoardIdentityFromUsername } from './supabase'

describe('resolveBoardIdentityFromUsername', () => {
  it('resolves the configured username to a stable Sleeper user id', async () => {
    const lookup = vi.fn().mockResolvedValue({ user_id: '456', username: 'samlee' })

    await expect(resolveBoardIdentityFromUsername({
      leagueId: '123',
      username: ' samlee ',
    }, lookup)).resolves.toStrictEqual({
      leagueId: '123',
      userId: '456',
    })
    expect(lookup).toHaveBeenCalledWith('samlee')
  })

  it('rejects a username Sleeper cannot resolve', async () => {
    const lookup = vi.fn().mockResolvedValue(null)

    await expect(resolveBoardIdentityFromUsername({ username: 'missing' }, lookup))
      .rejects.toThrow('Sleeper user "missing" was not found')
  })
})
