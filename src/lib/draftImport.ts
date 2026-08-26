import type { DraftHistoryStore } from './draftStore'
import { savedDraftFromSleeper } from './draftStore'
import { fetchDraft, fetchDraftParticipants, fetchDraftPicks, fetchUserDrafts } from './sleeper'
import type { SleeperDraft, SleeperPick } from '../types'

interface DraftImportDependencies {
  listDrafts: (userId: string, season: number) => Promise<SleeperDraft[]>
  fetchDraftDetails: (draftId: string) => Promise<SleeperDraft>
  fetchPicks: (draftId: string) => Promise<SleeperPick[]>
  fetchParticipants: (draftId: string) => Promise<Record<string, string>>
}

const FIRST_SLEEPER_NFL_SEASON = 2017

export function sleeperDraftSeasons(currentYear = new Date().getFullYear()): number[] {
  return Array.from(
    { length: Math.max(1, currentYear - FIRST_SLEEPER_NFL_SEASON + 1) },
    (_, index) => currentYear - index,
  )
}

const defaultDependencies: DraftImportDependencies = {
  listDrafts: (userId, season) => fetchUserDrafts(userId, season),
  fetchDraftDetails: (draftId) => fetchDraft(draftId),
  fetchPicks: (draftId) => fetchDraftPicks(draftId, undefined, { fresh: true }),
  fetchParticipants: (draftId) => fetchDraftParticipants(draftId),
}

export async function importSleeperDrafts(
  store: DraftHistoryStore,
  season: number | number[] = sleeperDraftSeasons(),
  dependencies: DraftImportDependencies = defaultDependencies,
): Promise<number> {
  const seasons = Array.isArray(season) ? season : [season]
  const [draftsBySeason, savedDrafts] = await Promise.all([
    Promise.all(seasons.map((selectedSeason) => dependencies.listDrafts(store.userId, selectedSeason))),
    store.list(),
  ])
  const listedDrafts = draftsBySeason.flat()
  const listedIds = new Set(listedDrafts.map((draft) => draft.draft_id))
  const recoveredDrafts = await Promise.all(savedDrafts
    .filter((draft) => !listedIds.has(draft.draftId))
    .map(async (draft) => {
      try {
        return await dependencies.fetchDraftDetails(draft.draftId)
      } catch {
        return null
      }
    }))
  const drafts = Array.from(
    new Map([...listedDrafts, ...recoveredDrafts.filter((draft): draft is SleeperDraft => Boolean(draft?.draft_id))]
      .map((draft) => [draft.draft_id, draft])).values(),
  )

  await Promise.all(drafts.map(async (draft) => {
    const [picks, participants] = await Promise.all([
      dependencies.fetchPicks(draft.draft_id),
      dependencies.fetchParticipants(draft.draft_id),
    ])
    await store.save(savedDraftFromSleeper(draft, picks, participants, store.userId))
  }))
  return drafts.length
}
