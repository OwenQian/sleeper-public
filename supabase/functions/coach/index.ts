import { Agent, run, setDefaultOpenAIKey, setTracingExportApiKey, tool } from 'npm:@openai/agents@0.17.0'
import { z } from 'npm:zod@4.4.3'

interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DraftPick {
  pick_no: number
  round: number
  draft_slot: number
  player_id: string
  picked_by?: string
  metadata?: { first_name?: string; last_name?: string; position?: string }
}

interface CoachDraft {
  draftId: string
  name: string
  sleeperUserId: string
  teams: number
  rounds: number
  draftSlot: number | null
  participants: Record<string, string>
  picks: DraftPick[]
}

interface CoachPoolPlayer {
  sleeperId?: string
  name: string
  position: string
  rank: number
  overallTier?: number
  positionTier: number
  adp?: number
  team?: string
  tags?: string[]
  note?: string
}

interface CoachNote {
  name: string
  content: string
}

interface CoachMemorySummary {
  content: string
  role: 'user' | 'assistant'
  draftName: string | null
  savedAt: string
}

interface CoachRequest {
  scope: 'history' | 'draft'
  drafts: CoachDraft[]
  messages: CoachMessage[]
  players?: CoachPoolPlayer[]
  notes?: CoachNote[]
  memories?: CoachMemorySummary[]
}

// Only browser pages from these origins may call the function. Any other
// website open in the same browser could otherwise spend the OpenAI key.
const DEFAULT_ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true // same-origin and non-browser clients send no Origin header
  const configured = Deno.env.get('COACH_ALLOWED_ORIGINS')
  if (configured) return configured.split(',').map((entry) => entry.trim()).filter(Boolean).includes(origin)
  return DEFAULT_ALLOWED_ORIGIN.test(origin)
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
}

function pickPlayerName(pick: DraftPick): string {
  return `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim() || pick.player_id
}

function roundPick(pick: DraftPick, teams: number): string {
  return `${pick.round}.${String(pick.pick_no - ((pick.round - 1) * teams)).padStart(2, '0')}`
}

function pickManager(pick: DraftPick, draft: CoachDraft): string {
  return pick.picked_by ? draft.participants[pick.picked_by] ?? pick.picked_by : `CPU slot ${pick.draft_slot}`
}

function describePick(pick: DraftPick, draft: CoachDraft) {
  return {
    pickNo: pick.pick_no,
    notation: roundPick(pick, draft.teams),
    player: pickPlayerName(pick),
    position: pick.metadata?.position ?? null,
    manager: pickManager(pick, draft),
    isUserPick: pick.draft_slot === draft.draftSlot,
  }
}

function replaySnapshot(draft: CoachDraft, pool: CoachPoolPlayer[], pickNo: number) {
  const ordered = [...draft.picks].sort((left, right) => left.pick_no - right.pick_no)
  const pick = ordered.find((candidate) => candidate.pick_no === pickNo)
  if (!pick) return { error: `Pick ${pickNo} does not exist in draft ${draft.draftId} (${ordered.length} picks).` }

  const priorPicks = ordered.filter((candidate) => candidate.pick_no < pickNo)
  const draftedIds = new Set(priorPicks.map((candidate) => candidate.player_id))
  const draftedNames = new Set(priorPicks.map((candidate) => normalizeName(pickPlayerName(candidate))).filter(Boolean))
  const available = pool.filter((player) =>
    !(player.sleeperId && draftedIds.has(player.sleeperId)) && !draftedNames.has(normalizeName(player.name)),
  )
  const bestAvailableByPosition: Record<string, CoachPoolPlayer[]> = {}
  for (const player of available) {
    const bucket = bestAvailableByPosition[player.position] ??= []
    if (bucket.length < 5) bucket.push(player)
  }

  return {
    pick: describePick(pick, draft),
    picksAlreadyMade: priorPicks.length,
    recentPicks: priorPicks.slice(-10).map((candidate) => describePick(candidate, draft)),
    bestAvailable: pool.length === 0
      ? 'No ranked player pool was provided, so availability cannot be computed. Grade using the pick order alone.'
      : available.slice(0, 25),
    bestAvailableByPosition,
  }
}

function describePoolPlayer(player: CoachPoolPlayer): string {
  const details = [
    `overall tier ${player.overallTier ?? '?'}`,
    `${player.position} tier ${player.positionTier}`,
    player.adp !== undefined ? `ADP ${player.adp}` : null,
    player.tags?.length ? `tags: ${player.tags.join('/')}` : null,
    player.note ? `note: ${player.note}` : null,
  ].filter(Boolean).join(', ')
  return `${player.rank}. ${player.name} (${player.position}${player.team ? ` ${player.team}` : ''}) — ${details}`
}

function boardContext(pool: CoachPoolPlayer[]): string {
  if (pool.length === 0) return ''
  return `\n\nUSER'S PRE-DRAFT BOARD (the user's own personal rankings — rank 1 is their top player; tiers, tags, and notes are theirs, not market consensus):\n${pool.slice(0, 150).map(describePoolPlayer).join('\n')}`
}

function draftContext(draft: CoachDraft): string {
  const picks = [...draft.picks]
    .sort((left, right) => left.pick_no - right.pick_no)
    .map((pick) => `${roundPick(pick, draft.teams)} (pick_no ${pick.pick_no}) ${pickPlayerName(pick)} (${pick.metadata?.position ?? '—'}) — ${pickManager(pick, draft)}`)
    .join('\n')
  return `DRAFT: ${draft.name}\nDraft ID: ${draft.draftId}\nUser slot: ${draft.draftSlot ?? 'unknown'}\n${picks}`
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 })
  }
  const headers = corsHeaders(origin)
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers })

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) return Response.json({ error: 'OPENAI_API_KEY is not configured for the coach function.' }, { status: 503, headers })
    setDefaultOpenAIKey(apiKey)
    setTracingExportApiKey(apiKey)
    const body = await request.json() as CoachRequest
    const draftLimit = body.scope === 'history' ? 8 : 1
    const drafts = Array.isArray(body.drafts) ? body.drafts.slice(0, draftLimit) : []
    const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : []
    const pool = Array.isArray(body.players) ? body.players.slice(0, 300) : []
    const notes = Array.isArray(body.notes) ? body.notes.slice(0, 12) : []
    const memories = Array.isArray(body.memories) ? body.memories.slice(0, 40) : []
    if (drafts.length === 0 || messages.length === 0) {
      return Response.json({ error: 'Draft context and a message are required.' }, { status: 400, headers })
    }

    const replayTool = tool({
      name: 'replay_draft_at_pick',
      description: 'Replay the draft to the moment a pick was on the clock. Returns the pick that was made, the picks immediately before it, and the best players still available overall and per position at that moment. Use it to grade a pick against its real alternatives.',
      parameters: z.object({
        draftId: z.string().describe('Draft ID from the supplied draft context.'),
        pickNo: z.number().int().min(1).describe('Overall pick number (pick_no) to replay to.'),
      }),
      execute: async ({ draftId, pickNo }) => {
        const draft = drafts.find((candidate) => candidate.draftId === draftId) ?? drafts[0]
        if (!draft) return JSON.stringify({ error: 'No draft context available.' })
        return JSON.stringify(replaySnapshot(draft, pool, pickNo))
      },
    })

    const coach = new Agent({
      name: 'Fantasy football draft coach',
      model: Deno.env.get('OPENAI_COACH_MODEL') ?? 'gpt-5.6',
      tools: [replayTool],
      instructions: `You are a rigorous fantasy football draft coach reviewing Sleeper drafts.
LEAGUE SETTINGS: 0.5 PPR (half-PPR) scoring. Starting lineup: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DST. Judge positional value, scarcity, and roster construction against these requirements — e.g. a third RB or WR (or second TE) competes for the single FLEX spot.
Use only the supplied draft evidence. Identify concrete patterns in position timing, roster construction, reaches, values, and alternatives visible at each turn.
You have a playback tool, replay_draft_at_pick, that reconstructs the exact board state when any pick was on the clock. When grading picks or naming alternatives, call it for each pick you evaluate — especially the user's picks — instead of guessing who was available. The user's picks are the ones at their draft slot.
The USER'S PRE-DRAFT BOARD section and the player pool behind the playback tool are the user's own rankings: rank, overall tier, and position tier reflect how the user personally valued players before the draft, with their own tags and notes attached. Use them to judge whether a pick matched the user's own tiers and stated takes — e.g. a pick is only a reach relative to their board if they ranked others in the same or a higher tier above him. ADP is included for market context.
Treat rank as the user's preferred player order: a lower rank number means the player is ranked more highly. For every pick you evaluate, consider the rankings of the players who were still available, identify the highest-ranked relevant alternatives, and cite their rank numbers when comparing them with the selection.
If you recommend a lower-ranked player over a higher-ranked available player, explicitly explain why roster construction or positional value justifies overriding the rankings.
If a COACH'S NOTES section is present, treat it as the user's own strategy and league knowledge: apply it when judging picks and cite the note by name when it changes a grade.
If a SAVED MEMORIES section is present, it holds insights the user chose to keep from earlier coaching sessions. Treat them as established prior conclusions: stay consistent with them, build on them, and point out when new evidence contradicts one.
Distinguish evidence from inference. Be direct but constructive. Reference round.pick notation and player names. Do not invent injuries, ADP, news, or outcomes that are absent from the data.`,
    })

    const notesContext = notes.length > 0
      ? `\n\nCOACH'S NOTES:\n${notes.map((note) => `### ${note.name}\n${note.content}`).join('\n\n')}`
      : ''
    const memoryContext = memories.length > 0
      ? `\n\nSAVED MEMORIES (newest first):\n${memories.map((memory) => `- [${memory.savedAt.slice(0, 10)}${memory.draftName ? ` · ${memory.draftName}` : ''} · ${memory.role}] ${memory.content}`).join('\n')}`
      : ''
    const transcript = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n')
    const result = await run(coach, `SCOPE: ${body.scope}\n\n${drafts.map(draftContext).join('\n\n')}${boardContext(pool)}${notesContext}${memoryContext}\n\nCONVERSATION:\n${transcript}`)
    const answer = typeof result.finalOutput === 'string' ? result.finalOutput : JSON.stringify(result.finalOutput)
    return Response.json({ answer }, { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The coach failed to respond.'
    return Response.json({ error: message }, { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } })
  }
})
