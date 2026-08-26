import type { Player, SavedDraft } from '../types'
import { loadCoachNotes, type CoachNote } from './coachNotes'
import type { CoachMemory } from './coachMemoryStore'
import { readSupabaseBrowserConfig } from './supabaseConfig'

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
  overallTier: number
  positionTier: number
  adp?: number
  team?: string
  tags?: string[]
  note?: string
}

export interface CoachMemorySummary {
  content: string
  role: 'user' | 'assistant'
  draftName: string | null
  savedAt: string
}

export interface CoachPayload {
  scope: CoachScope
  drafts: SavedDraft[]
  messages: CoachMessage[]
  players: CoachPoolPlayer[]
  notes: CoachNote[]
  memories: CoachMemorySummary[]
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
const MEMORY_LIMIT = 40
const MEMORY_CONTENT_LIMIT = 4000

export function toCoachMemorySummary(memory: CoachMemory): CoachMemorySummary {
  return {
    content: memory.content.slice(0, MEMORY_CONTENT_LIMIT),
    role: memory.role,
    draftName: memory.draftName,
    savedAt: memory.createdAt,
  }
}

export function buildCoachPayload(
  scope: CoachScope,
  drafts: SavedDraft[],
  messages: CoachMessage[],
  players: Player[] = [],
  notes: CoachNote[] = loadCoachNotes(),
  memories: CoachMemory[] = [],
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
      overallTier: player.overallTier,
      positionTier: player.positionTier,
      adp: player.adp,
      team: player.team,
      tags: player.tags.length > 0 ? player.tags : undefined,
      note: player.note?.trim() ? player.note.trim().slice(0, 240) : undefined,
    }))
  const recentMemories = [...memories]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MEMORY_LIMIT)
    .map(toCoachMemorySummary)
  return {
    scope,
    drafts: scope === 'history' ? newestFirst.slice(0, 8) : newestFirst.slice(0, 1),
    messages,
    players: pool,
    notes,
    memories: recentMemories,
  }
}

export const requestCoach: CoachClient = async (payload) => {
  const config = readSupabaseBrowserConfig(import.meta.env)
  if (!config) throw new Error('Connect local Supabase before starting the coach.')

  const response = await fetch(`${config.url}/functions/v1/coach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.key}`,
      apikey: config.key,
    },
    body: JSON.stringify(payload),
  })
  const result = await response.json() as { answer?: string; error?: string; message?: string }
  if (!response.ok || !result.answer) {
    if (!result.error && response.status >= 500) {
      throw new Error('The coach service is offline. Start it with `npm run coach:serve`.')
    }
    throw new Error(result.error ?? result.message ?? 'The coach could not answer right now.')
  }
  return result.answer
}
