import type { Player, SavedDraft } from '../types'
import { loadCoachNotes, type CoachNote } from './coachNotes'

export type CoachScope = 'history' | 'draft'

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachPoolPlayer {
  sleeperId?: string
  name: string
  position: string
  rank: number
  positionTier: number
  adp?: number
  team?: string
}

export interface CoachPayload {
  scope: CoachScope
  drafts: SavedDraft[]
  messages: CoachMessage[]
  players: CoachPoolPlayer[]
  notes: CoachNote[]
}

export interface CoachPreset {
  label: string
  prompt: string
}

export const COACH_PRESETS: Record<CoachScope, CoachPreset[]> = {
  draft: [
    {
      label: 'Grade my draft',
      prompt: `give my draft a score out of 100

use the playback feature to go through each pick and grade the pick relative to the players that were available. if the choice was suboptimal explain why and suggest alternatives and give justifications for those alternatives. if the choice was good explain why the choice was good`,
    },
  ],
  history: [],
}

export type CoachClient = (payload: CoachPayload) => Promise<string>

const PLAYER_POOL_LIMIT = 300

export function buildCoachPayload(
  scope: CoachScope,
  drafts: SavedDraft[],
  messages: CoachMessage[],
  players: Player[] = [],
  notes: CoachNote[] = loadCoachNotes(),
): CoachPayload {
  const newestFirst = [...drafts].sort((left, right) =>
    new Date(right.createdAt ?? right.syncedAt).getTime() - new Date(left.createdAt ?? left.syncedAt).getTime(),
  )
  const pool = [...players]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, PLAYER_POOL_LIMIT)
    .map((player): CoachPoolPlayer => ({
      sleeperId: player.sleeperId,
      name: player.name,
      position: player.position,
      rank: player.rank,
      positionTier: player.positionTier,
      adp: player.adp,
      team: player.team,
    }))
  return {
    scope,
    drafts: scope === 'history' ? newestFirst.slice(0, 8) : newestFirst.slice(0, 1),
    messages,
    players: pool,
    notes,
  }
}

export const requestCoach: CoachClient = async (payload) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !anonKey) throw new Error('Connect local Supabase before starting the coach.')

  const response = await fetch(`${supabaseUrl}/functions/v1/coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json() as { answer?: string; error?: string }
  if (!response.ok || !result.answer) throw new Error(result.error ?? 'The coach could not answer right now.')
  return result.answer
}
