import type { DraftHistoryStore } from './draftStore'
import { savedDraftFromSleeper } from './draftStore'
import {
  fetchArchivedMockDraft,
  fetchDraft as fetchSleeperDraft,
  fetchLeagueDrafts,
  type ArchivedMockDraft,
} from './sleeper'
import type { SleeperDraft } from '../types'

const DRAFT_ID_PATTERN = /\b\d{16,20}\b/g

export function parseSleeperMockImportIds(value: string): string[] {
  return [...new Set(value.match(DRAFT_ID_PATTERN) ?? [])]
}

interface MockImportDependencies {
  fetchLeagueDrafts: (leagueId: string) => Promise<SleeperDraft[]>
  fetchArchivedMock: (draftId: string, teams: number, draftType: string) => Promise<ArchivedMockDraft>
  fetchDraftDetails: (draftId: string) => Promise<SleeperDraft | null>
}

const defaultDependencies: MockImportDependencies = {
  fetchLeagueDrafts: (leagueId) => fetchLeagueDrafts(leagueId),
  fetchArchivedMock: (draftId, teams, draftType) => fetchArchivedMockDraft(draftId, teams, draftType),
  fetchDraftDetails: async (draftId) => {
    try {
      const draft = await fetchSleeperDraft(draftId)
      return draft?.draft_id ? draft : null
    } catch {
      return null
    }
  },
}

export async function importSleeperMockDraftIds(
  store: DraftHistoryStore,
  draftIds: string[],
  leagueId: string,
  dependencies: MockImportDependencies = defaultDependencies,
): Promise<number> {
  const referenceDrafts = await dependencies.fetchLeagueDrafts(leagueId)
  const referenceDraft = referenceDrafts.find((draft) => draft.settings?.teams)
  if (!referenceDraft) throw new Error('Sleeper did not return a league draft to use for mock settings.')

  const teams = referenceDraft.settings?.teams ?? 12
  const draftType = referenceDraft.type ?? 'snake'
  await Promise.all(draftIds.map(async (draftId) => {
    const [archived, draftDetails] = await Promise.all([
      dependencies.fetchArchivedMock(draftId, teams, draftType),
      dependencies.fetchDraftDetails(draftId),
    ])
    if (archived.picks.length === 0) throw new Error(`Sleeper returned no picks for mock ${draftId}.`)
    const draftOrder: Record<string, number> = {}
    archived.picks.forEach((pick) => {
      if (pick.picked_by && archived.participants[pick.picked_by] && !draftOrder[pick.picked_by]) {
        draftOrder[pick.picked_by] = pick.draft_slot
      }
    })
    const mockDraft: SleeperDraft = {
      ...referenceDraft,
      ...(draftDetails ?? {}),
      draft_id: draftId,
      league_id: null,
      status: 'complete',
      draft_order: draftOrder,
      start_time: draftDetails?.start_time,
      created: draftDetails?.created,
      metadata: { ...referenceDraft.metadata, ...draftDetails?.metadata, ...archived.metadata },
    }
    await store.save(savedDraftFromSleeper(
      mockDraft,
      archived.picks,
      archived.participants,
      store.userId,
    ))
  }))

  return draftIds.length
}
