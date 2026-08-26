import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftsPage } from './DraftsPage'
import type { DraftHistoryStore } from '../lib/draftStore'
import type { SavedDraft } from '../types'

function draft(overrides: Partial<SavedDraft>): SavedDraft {
  return {
    draftId: 'draft-1', sleeperUserId: 'user-1', leagueId: null, season: 2026,
    name: 'August mock', status: 'complete', type: 'snake', teams: 12, rounds: 15,
    draftSlot: 2, participants: {}, picks: [], metadata: {}, createdAt: null,
    syncedAt: '2026-08-25T22:00:00.000Z', ...overrides,
  }
}

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('DraftsPage', () => {
  it('shows persisted drafts and opens a selected draft', async () => {
    const user = userEvent.setup()
    const onOpenDraft = vi.fn()
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([
        draft({ draftId: 'newer', name: 'Newer mock', syncedAt: '2026-08-25T23:00:00.000Z', picks: [{ player_id: '1', pick_no: 1, round: 1, draft_slot: 1 }] }),
        draft({ draftId: 'older', name: 'Older mock' }),
      ]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    render(<DraftsPage store={store} onOpenDraft={onOpenDraft} autoImport={false} />)

    expect(await screen.findByRole('heading', { name: 'Draft history' })).toBeInTheDocument()
    expect(await screen.findByText('Newer mock')).toBeInTheDocument()
    expect(screen.getAllByTestId('draft-card').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Newer mock'),
      expect.stringContaining('Older mock'),
    ])
    await user.click(screen.getByRole('button', { name: 'Review Newer mock' }))
    expect(onOpenDraft).toHaveBeenCalledWith('newer')
  })

  it('shows when a draft started rather than when it was imported', async () => {
    const startedAt = '2026-07-04T18:00:00.000Z'
    const importedAt = '2026-08-25T22:00:00.000Z'
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([draft({ createdAt: startedAt, syncedAt: importedAt })]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    render(<DraftsPage store={store} onOpenDraft={() => undefined} autoImport={false} />)

    expect(await screen.findByText(new Date(startedAt).toLocaleDateString())).toBeInTheDocument()
    expect(screen.queryByText(new Date(importedAt).toLocaleDateString())).not.toBeInTheDocument()
  })

  it('confirms and deletes a saved draft from history', async () => {
    const user = userEvent.setup()
    const deleteDraft = vi.fn().mockResolvedValue(undefined)
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([
        draft({ draftId: 'draft-1', name: 'August mock' }),
        draft({ draftId: 'draft-2', name: 'League draft' }),
      ]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: deleteDraft,
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<DraftsPage store={store} onOpenDraft={() => undefined} autoImport={false} />)

    await user.click(await screen.findByRole('button', { name: 'Delete August mock' }))

    expect(window.confirm).toHaveBeenCalledWith('Delete “August mock” from your draft history? This cannot be undone.')
    await waitFor(() => expect(deleteDraft).toHaveBeenCalledWith('draft-1'))
    expect(screen.queryByRole('heading', { name: 'August mock' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'League draft' })).toBeInTheDocument()
  })

  it('labels mock drafts and gives their tiles a distinct treatment', async () => {
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([
        draft({ draftId: 'mock-1', name: 'Practice run', leagueId: null }),
        draft({ draftId: 'league-1', name: 'League draft', leagueId: 'league-1' }),
      ]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    render(<DraftsPage store={store} onOpenDraft={() => undefined} autoImport={false} />)

    const mockCard = (await screen.findByRole('heading', { name: 'Practice run' })).closest('[data-testid="draft-card"]')
    const leagueCard = screen.getByRole('heading', { name: 'League draft' }).closest('[data-testid="draft-card"]')
    expect(mockCard).toHaveClass('draft-history-card--mock')
    expect(within(mockCard as HTMLElement).getByText('Mock draft')).toBeInTheDocument()
    expect(leagueCard).not.toHaveClass('draft-history-card--mock')
    expect(within(leagueCard as HTMLElement).queryByText('Mock draft')).not.toBeInTheDocument()
  })

  it('imports recent Sleeper drafts and reloads persisted history', async () => {
    const importDrafts = vi.fn().mockResolvedValue(2)
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    render(<DraftsPage store={store} onOpenDraft={() => undefined} importDrafts={importDrafts} />)

    await waitFor(() => expect(importDrafts).toHaveBeenCalledWith(store))
    expect(store.list).toHaveBeenCalled()
    expect(await screen.findByText('Synced 2 Sleeper drafts.')).toBeInTheDocument()
  })

  it('imports one or more practice mock links entered directly', async () => {
    const user = userEvent.setup()
    const importMockDrafts = vi.fn().mockResolvedValue(2)
    const store: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    render(
      <DraftsPage
        store={store}
        onOpenDraft={() => undefined}
        autoImport={false}
        leagueId="league-1"
        importMockDrafts={importMockDrafts}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Import practice mocks' }))
    await user.type(
      screen.getByLabelText('Sleeper mock draft links or IDs'),
      'https://sleeper.com/draft/nfl/1300000000000000002, 1300000000000000001',
    )
    await user.click(screen.getByRole('button', { name: 'Import mocks' }))

    await waitFor(() => expect(importMockDrafts).toHaveBeenCalledWith(
      store,
      ['1300000000000000002', '1300000000000000001'],
      'league-1',
    ))
    expect(await screen.findByText('Imported 2 practice mocks.')).toBeInTheDocument()
  })
})
