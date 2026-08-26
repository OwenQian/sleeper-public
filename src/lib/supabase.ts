import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseBoardStore,
  type BoardIdentity,
  type BoardStore,
} from './boardStore'
import { fetchSleeperUser } from './sleeper'
import type { SleeperUser } from '../types'
import { createSupabaseDraftStore, type DraftHistoryStore } from './draftStore'
import { createSupabaseCoachMemoryStore, type CoachMemoryStore } from './coachMemoryStore'
import { readSupabaseBrowserConfig } from './supabaseConfig'

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
  const config = readSupabaseBrowserConfig(import.meta.env)
  if (!config) return null

  return createUsernameBoardStore(createClient(config.url, config.key), {
    leagueId: import.meta.env.VITE_SLEEPER_LEAGUE_ID,
    username: import.meta.env.VITE_SLEEPER_USERNAME,
  })
}

export function createConfiguredDraftHistoryStore(): Promise<DraftHistoryStore | null> {
  const config = readSupabaseBrowserConfig(import.meta.env)
  if (!config) return Promise.resolve(null)

  return resolveBoardIdentityFromUsername({
    leagueId: import.meta.env.VITE_SLEEPER_LEAGUE_ID,
    username: import.meta.env.VITE_SLEEPER_USERNAME,
  }).then((identity) => identity.userId
    ? createSupabaseDraftStore(createClient(config.url, config.key), { userId: identity.userId })
    : null)
}

export function createConfiguredCoachMemoryStore(): Promise<CoachMemoryStore | null> {
  const config = readSupabaseBrowserConfig(import.meta.env)
  if (!config) return Promise.resolve(null)

  return resolveBoardIdentityFromUsername({
    leagueId: import.meta.env.VITE_SLEEPER_LEAGUE_ID,
    username: import.meta.env.VITE_SLEEPER_USERNAME,
  }).then((identity) => identity.userId
    ? createSupabaseCoachMemoryStore(createClient(config.url, config.key), { userId: identity.userId })
    : null)
}
