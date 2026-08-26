import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseBoardStore,
  type BoardIdentity,
  type BoardStore,
} from './boardStore'
import { fetchSleeperUser } from './sleeper'
import type { SleeperUser } from '../types'
import { createSupabaseDraftStore, type DraftHistoryStore } from './draftStore'

interface UsernameBoardIdentity {
  leagueId?: string
  username?: string
}

type UserLookup = (username: string) => Promise<SleeperUser | null>

export async function resolveBoardIdentityFromUsername(
  identity: UsernameBoardIdentity,
  lookup: UserLookup = fetchSleeperUser,
): Promise<BoardIdentity> {
  const username = identity.username?.trim()
  if (!username) return { leagueId: identity.leagueId }

  const user = await lookup(username)
  if (!user?.user_id) throw new Error(`Sleeper user "${username}" was not found`)
  return {
    leagueId: identity.leagueId,
    userId: user.user_id,
  }
}

function createUsernameBoardStore(
  client: SupabaseClient,
  identity: UsernameBoardIdentity,
): BoardStore {
  let resolvedStore: Promise<BoardStore> | undefined
  const getStore = () => {
    resolvedStore ??= resolveBoardIdentityFromUsername(identity)
      .then((resolvedIdentity) => createSupabaseBoardStore(client, resolvedIdentity))
    return resolvedStore
  }

  return {
    async load() {
      return (await getStore()).load()
    },
    async save(snapshot) {
      return (await getStore()).save(snapshot)
    },
  }
}

export function createConfiguredBoardStore(): BoardStore | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null

  return createUsernameBoardStore(createClient(url, anonKey), {
    leagueId: import.meta.env.VITE_SLEEPER_LEAGUE_ID,
    username: import.meta.env.VITE_SLEEPER_USERNAME,
  })
}

export function createConfiguredDraftHistoryStore(): Promise<DraftHistoryStore | null> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return Promise.resolve(null)

  return resolveBoardIdentityFromUsername({
    leagueId: import.meta.env.VITE_SLEEPER_LEAGUE_ID,
    username: import.meta.env.VITE_SLEEPER_USERNAME,
  }).then((identity) => identity.userId
    ? createSupabaseDraftStore(createClient(url, anonKey), { userId: identity.userId })
    : null)
}
