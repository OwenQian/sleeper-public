import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftDetailPage } from './DraftDetailPage'
import type { DraftHistoryStore } from '../lib/draftStore'
import type { Player, SavedDraft } from '../types'

const draft: SavedDraft = {
  draftId: 'draft-1', sleeperUserId: 'user-1', leagueId: null, season: 2026,
  name: 'Tuesday mock', status: 'complete', type: 'snake', teams: 12, rounds: 15,
  draftSlot: 2, participants: { 'user-1': 'Sam' }, metadata: {}, createdAt: null,
  syncedAt: '2026-08-25T22:00:00.000Z',
  picks: [
    { player_id: '101', pick_no: 47, round: 4, draft_slot: 2, picked_by: 'user-1', metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' } },
    { player_id: '102', pick_no: 48, round: 4, draft_slot: 1, metadata: { first_name: 'Lamar', last_name: 'Jackson', position: 'QB' } },
  ],
}
const players = [
  { id: 'josh', sleeperId: '101', name: 'Josh Allen', position: 'QB', rank: 1 },
  { id: 'lamar', sleeperId: '102', name: 'Lamar Jackson', position: 'QB', rank: 2 },
  { id: 'bijan', sleeperId: '103', name: 'Bijan Robinson', position: 'RB', rank: 3 },
] as Player[]

describe('DraftDetailPage', () => {
  it('renders the team-column draft board and jumps back to a selected pick', async () => {
    const user = userEvent.setup()
    const store: DraftHistoryStore = {
      userId: 'user-1', list: vi.fn().mockResolvedValue([draft]),
      get: vi.fn().mockResolvedValue(draft), save: vi.fn().mockResolvedValue(undefined),
    }

    render(<DraftDetailPage draftId="draft-1" store={store} players={players} onBack={() => undefined} />)

    expect(await screen.findByRole('heading', { name: 'Tuesday mock' })).toBeInTheDocument()
    expect(screen.getAllByTestId('draft-team-header')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'Select pick 4.11' }))
    await user.click(screen.getByRole('button', { name: 'Jump back to 4.11' }))

    expect(screen.getByText('Replay after 4.11')).toBeInTheDocument()
    expect(screen.getByText('47 picks made')).toBeInTheDocument()
    expect(screen.getByTestId('draft-pick-48')).toHaveClass('draft-pick--future')
    expect(screen.getByRole('heading', { name: 'Available at this point' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Bijan Robinson')).toBeInTheDocument())
  })
})
