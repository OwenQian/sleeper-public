import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { BoardStore } from './lib/boardStore'
import type { DraftHistoryStore } from './lib/draftStore'
import { parseRankingsCsv } from './lib/rankings'

const rankings = `Overall,Player,Position,Pos Rank,Tier,Auction (Out of $200)
1,Jahmyr Gibbs,RB,1,1,$63
2,Ja'Marr Chase,WR,1,2,$59
3,Puka Nacua,WR,2,2,$58
4,Josh Allen,QB,1,8,$29
5,Lamar Jackson,QB,2,11,$17`

describe('draft room', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the pre-ingested rankings grouped into tiers', () => {
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    expect(screen.getByRole('heading', { name: 'Draft room' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tier 1' })).toBeInTheDocument()
    expect(screen.getByText('Jahmyr Gibbs')).toBeInTheDocument()
  })

  it('navigates to draft history as a top-level page', async () => {
    const user = userEvent.setup()
    const draftHistoryStore: DraftHistoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    }
    render(<App initialCsv={rankings} disableNetwork boardStore={null} draftHistoryStore={draftHistoryStore} />)

    await user.click(screen.getByRole('button', { name: 'Drafts' }))

    expect(await screen.findByRole('heading', { name: 'Draft history' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Draft room' })).not.toBeInTheDocument()
  })

  it('applies Sleeper-inspired colors to offensive position cards', () => {
    const rankingsWithTightEnd = `${rankings}\n6,Brock Bowers,TE,1,12,$16`
    render(<App initialCsv={rankingsWithTightEnd} disableNetwork boardStore={null} />)

    expect(screen.getByTestId('player-ja-marr-chase-wr')).toHaveClass('player-card--wr')
    expect(screen.getByTestId('player-jahmyr-gibbs-rb')).toHaveClass('player-card--rb')
    expect(screen.getByTestId('player-brock-bowers-te')).toHaveClass('player-card--te')
    expect(screen.getByTestId('player-josh-allen-qb')).toHaveClass('player-card--qb')
  })

  it('filters by position and shows overall and positional tiers', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByRole('button', { name: 'QB' }))

    expect(screen.queryByText('Jahmyr Gibbs')).not.toBeInTheDocument()
    const allen = screen.getByTestId('player-josh-allen-qb')
    expect(within(allen).getByText('Overall T8')).toBeInTheDocument()
    expect(within(allen).getByText('QB T1')).toBeInTheDocument()
  })

  it('switches to Sleeper ADP pick-window groups', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByRole('button', { name: 'Pick windows' }))

    expect(screen.getByText('Sleeper ADP windows')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No Sleeper ADP' })).toBeInTheDocument()
  })

  it('switches to a flat board sorted by Sleeper ADP', async () => {
    const user = userEvent.setup()
    const storedPlayers = parseRankingsCsv(rankings).map((player, index) => ({
      ...player,
      adp: [undefined, 24, 2, 900, 15][index],
    }))
    const boardStore: BoardStore = {
      load: vi.fn().mockResolvedValue({ players: storedPlayers }),
      save: vi.fn().mockResolvedValue(undefined),
    }
    render(<App initialCsv={rankings} disableNetwork boardStore={boardStore} />)
    await waitFor(() => expect(within(screen.getByTestId('player-puka-nacua-wr')).getByText('2.0')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Sleeper ADP' }))

    expect(screen.getByText('Sleeper ADP rankings')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^player-/).map((card) => card.dataset.testid)).toEqual([
      'player-puka-nacua-wr',
      'player-lamar-jackson-qb',
      'player-ja-marr-chase-wr',
      'player-jahmyr-gibbs-rb',
      'player-josh-allen-qb',
    ])
  })

  it('opens player details and applies a color-coded target tag', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByText('Jahmyr Gibbs'))
    expect(screen.getByRole('dialog', { name: 'Jahmyr Gibbs details' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move up one tier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move down one tier' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle Target tag' }))
    expect(screen.getByText('Target', { selector: '.player-card__tag' })).toBeInTheDocument()
  })

  it('hydrates personal state from the configured board store and saves edits', async () => {
    const save = vi.fn<BoardStore['save']>().mockResolvedValue(undefined)
    const boardStore: BoardStore = {
      load: vi.fn().mockResolvedValue({
        players: [{
          id: 'jahmyr-gibbs-rb',
          name: 'Jahmyr Gibbs',
          position: 'RB',
          sourcePositionRank: 1,
          rank: 1,
          overallTier: 1,
          positionTier: 1,
          auctionValue: 63,
          tags: ['target'],
          unavailable: false,
          note: 'Loaded from Supabase',
        }],
      }),
      save,
    }

    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={boardStore} />)

    await waitFor(() => expect(screen.getByText('Target', { selector: '.player-card__tag' })).toBeInTheDocument())
    await user.click(screen.getByText('Jahmyr Gibbs'))
    expect(screen.getByDisplayValue('Loaded from Supabase')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle High upside tag' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls.at(-1)?.[0].players[0].tags).toEqual(['target', 'upside'])
  })

  it('marks a moved ranking as edited and can restore its source position', async () => {
    const user = userEvent.setup()
    const boardStore: BoardStore = {
      load: vi.fn().mockResolvedValue({
        players: [{
          id: 'jahmyr-gibbs-rb',
          name: 'Jahmyr Gibbs',
          position: 'RB',
          sourcePositionRank: 1,
          sourceRank: 1,
          sourceOverallTier: 1,
          rank: 2,
          overallTier: 2,
          positionTier: 1,
          auctionValue: 63,
          tags: [],
          unavailable: false,
          rankingEdited: true,
        }],
      }),
      save: vi.fn().mockResolvedValue(undefined),
    }
    render(<App initialCsv={rankings} disableNetwork boardStore={boardStore} />)

    await waitFor(() => expect(screen.getByText('Edited')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Reset Jahmyr Gibbs to original ranking' }))
    expect(screen.queryByText('Edited')).not.toBeInTheDocument()
  })

  it('moves players up and down only within their tier using buttons', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    const chase = screen.getByTestId('player-ja-marr-chase-wr')
    expect(within(chase).getByRole('button', { name: "Move Ja'Marr Chase up within tier" })).toBeDisabled()

    await user.click(within(chase).getByRole('button', { name: "Move Ja'Marr Chase down within tier" }))

    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByTestId('player-puka-nacua-wr')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).getByText('Edited')).toBeInTheDocument()
  })

  it('ignores a player dropped onto another player in the same tier', () => {
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    fireEvent.dragStart(screen.getByTestId('player-puka-nacua-wr'))
    fireEvent.drop(screen.getByTestId('player-ja-marr-chase-wr'))

    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('player-puka-nacua-wr')).getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('Edited')).not.toBeInTheDocument()
  })

  it('clears drag state when a drag is cancelled', () => {
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)
    const puka = screen.getByTestId('player-puka-nacua-wr')

    fireEvent.dragStart(puka)
    expect(puka).toHaveClass('player-card--dragging')
    fireEvent.dragEnd(puka)

    expect(screen.getByTestId('player-puka-nacua-wr')).not.toHaveClass('player-card--dragging')
    expect(screen.queryByText('Edited')).not.toBeInTheDocument()
  })

  it('moves and marks a player dropped into a different tier', () => {
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    fireEvent.dragStart(screen.getByTestId('player-puka-nacua-wr'))
    fireEvent.drop(screen.getByTestId('player-josh-allen-qb'))

    const puka = screen.getByTestId('player-puka-nacua-wr')
    expect(within(puka).getByText('Overall T8')).toBeInTheDocument()
    expect(within(puka).getByText('Edited')).toBeInTheDocument()
  })

  it('opens reset choices with rankings selected and reset all exclusive', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByRole('button', { name: 'Reset' }))

    const dialog = screen.getByRole('dialog', { name: 'Reset draft board' })
    const rankingsOption = within(dialog).getByRole('checkbox', { name: 'Reset rankings' })
    const tagsOption = within(dialog).getByRole('checkbox', { name: 'Tags' })
    const allOption = within(dialog).getByRole('checkbox', { name: 'Reset all' })
    expect(rankingsOption).toBeChecked()
    expect(tagsOption).not.toBeChecked()
    expect(allOption).not.toBeChecked()

    await user.click(allOption)
    expect(rankingsOption).not.toBeChecked()
    expect(tagsOption).not.toBeChecked()
    expect(allOption).toBeChecked()
  })

  it('applies the default rankings-only reset', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(within(screen.getByTestId('player-ja-marr-chase-wr')).getByRole('button', { name: "Move Ja'Marr Chase down within tier" }))
    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).getByText('Edited')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await user.click(screen.getByRole('button', { name: 'Apply reset' }))

    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('player-ja-marr-chase-wr')).queryByText('Edited')).not.toBeInTheDocument()
  })

  it('hides drafted players until unavailable players are revealed', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByRole('button', { name: 'Mark Jahmyr Gibbs unavailable' }))
    expect(screen.queryByText('Jahmyr Gibbs')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Hide unavailable' }))
    expect(screen.getByText('Jahmyr Gibbs')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })

  it('opens mock-draft sync and validates the Sleeper draft URL', async () => {
    const user = userEvent.setup()
    render(<App initialCsv={rankings} disableNetwork boardStore={null} />)

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    expect(screen.getByRole('dialog', { name: 'Sleeper mock draft sync' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), 'not-a-draft')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))
    expect(screen.getByText('Paste a valid Sleeper draft URL or ID.')).toBeInTheDocument()
  })

  it('fetches fresh picks immediately when Sync now is clicked', async () => {
    const user = userEvent.setup()
    const firstPick = { player_id: 'one', pick_no: 1, round: 1, draft_slot: 1 }
    const secondPick = { player_id: 'two', pick_no: 2, round: 1, draft_slot: 2 }
    const draftPickFetcher = vi.fn()
      .mockResolvedValueOnce([firstPick])
      .mockResolvedValueOnce([firstPick, secondPick])
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/picks')
        ? [firstPick]
        : {
            draft_id: '1300000000000000002',
            league_id: null,
            draft_order: {},
          },
    })))
    render(
      <App
        initialCsv={rankings}
        disableNetwork
        boardStore={null}
        draftPickFetcher={draftPickFetcher}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))
    await waitFor(() => expect(screen.getByText('1 picks received')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Sync now' }))

    await waitFor(() => expect(screen.getByText('2 picks received')).toBeInTheDocument())
    expect(draftPickFetcher).toHaveBeenCalledTimes(2)
    expect(draftPickFetcher.mock.calls[1][2]).toEqual({ fresh: true })
  })

  it('shows the next round and overall pick instead of the available-player count', async () => {
    const user = userEvent.setup()
    const picks = Array.from({ length: 46 }, (_, index) => ({
      player_id: `player-${index + 1}`,
      pick_no: index + 1,
      round: Math.floor(index / 12) + 1,
      draft_slot: (index % 12) + 1,
    }))
    const draftPickFetcher = vi.fn().mockResolvedValue(picks)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft_id: '1300000000000000002', league_id: null, draft_order: {} }),
    }))
    render(<App initialCsv={rankings} disableNetwork boardStore={null} draftPickFetcher={draftPickFetcher} />)

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))

    const summary = screen.getByLabelText('Draft board summary')
    await waitFor(() => expect(within(summary).getByText('4.11')).toBeInTheDocument())
    expect(within(summary).getByText('Round pick')).toBeInTheDocument()
    expect(within(summary).getByText('47')).toBeInTheDocument()
    expect(within(summary).getByText('Overall pick')).toBeInTheDocument()
    expect(within(summary).queryByText('Available')).not.toBeInTheDocument()
  })

  it('persists every successfully synced Sleeper draft', async () => {
    const user = userEvent.setup()
    const pick = {
      player_id: 'one', pick_no: 1, round: 1, draft_slot: 2, picked_by: 'user-456',
      metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
    }
    const draftPickFetcher = vi.fn().mockResolvedValue([pick])
    const draftHistoryStore: DraftHistoryStore = {
      userId: 'user-456',
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/user/user-456')
        ? { user_id: 'user-456', display_name: 'Sam' }
        : {
            draft_id: '1300000000000000002',
            league_id: null,
            season: '2026',
            status: 'drafting',
            type: 'mock',
            created: 1787700000000,
            draft_order: { 'user-456': 2 },
            settings: { teams: 12, rounds: 15 },
            metadata: { name: 'Tuesday mock' },
          },
    })))
    render(
      <App
        initialCsv={rankings}
        disableNetwork
        boardStore={null}
        draftHistoryStore={draftHistoryStore}
        draftPickFetcher={draftPickFetcher}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))

    await waitFor(() => expect(draftHistoryStore.save).toHaveBeenCalledWith(expect.objectContaining({
      draftId: '1300000000000000002',
      sleeperUserId: 'user-456',
      name: 'Tuesday mock',
      draftSlot: 2,
      picks: [pick],
    })))
  })

  it('shows recent picks using round and pick notation', async () => {
    const user = userEvent.setup()
    const draftPickFetcher = vi.fn().mockResolvedValue([{
      player_id: 'one',
      pick_no: 37,
      round: 4,
      draft_slot: 12,
      metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft_id: '1300000000000000002', league_id: null, draft_order: {} }),
    }))
    render(<App initialCsv={rankings} disableNetwork boardStore={null} draftPickFetcher={draftPickFetcher} />)

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))

    await waitFor(() => expect(screen.getByText('4.01')).toBeInTheDocument())
  })

  it('copies the round-grouped draft results to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    const draftPickFetcher = vi.fn().mockResolvedValue([{
      player_id: 'one',
      pick_no: 37,
      round: 4,
      draft_slot: 12,
      metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft_id: '1300000000000000002', league_id: null, draft_order: {} }),
    }))
    render(<App initialCsv={rankings} disableNetwork boardStore={null} draftPickFetcher={draftPickFetcher} />)

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))
    await waitFor(() => expect(screen.getByText('4.01')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Copy results' }))

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('| 4.01 | 37 | Josh Allen | QB |'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('saves the round-grouped draft results as a Markdown file', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:draft-results')
    const revokeObjectURL = vi.fn()
    const NativeURL = URL
    class MockURL extends NativeURL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
    vi.stubGlobal('URL', MockURL)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const draftPickFetcher = vi.fn().mockResolvedValue([{
      player_id: 'one',
      pick_no: 37,
      round: 4,
      draft_slot: 12,
      metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ draft_id: '1300000000000000002', league_id: null, draft_order: {} }),
    }))
    render(<App initialCsv={rankings} disableNetwork boardStore={null} draftPickFetcher={draftPickFetcher} />)

    await user.click(screen.getByRole('button', { name: 'Connect mock draft' }))
    await user.type(screen.getByLabelText('Sleeper draft URL or ID'), '1300000000000000002')
    await user.click(screen.getByRole('button', { name: 'Start syncing' }))
    await waitFor(() => expect(screen.getByText('4.01')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Save .md' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(click.mock.instances[0]).toMatchObject({ download: 'sleeper-draft-1300000000000000002.md' })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft-results')
  })
})
