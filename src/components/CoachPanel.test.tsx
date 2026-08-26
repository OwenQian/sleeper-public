import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CoachPanel } from './CoachPanel'
import type { Player, SavedDraft } from '../types'

const draft = {
  draftId: 'draft-1', sleeperUserId: 'user-1', leagueId: null, season: 2026,
  name: 'Tuesday mock', status: 'complete', type: 'snake', teams: 12, rounds: 15,
  draftSlot: 2, participants: {}, picks: [], metadata: {}, createdAt: null,
  syncedAt: '2026-08-25T22:00:00.000Z',
} as SavedDraft

describe('CoachPanel', () => {
  it('sends a scoped conversation and renders the coach response', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('You consistently wait too long at wide receiver.')
    render(<CoachPanel scope="draft" drafts={[draft]} onClose={() => undefined} client={client} />)

    await user.type(screen.getByLabelText('Message your coach'), 'What should I change?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('You consistently wait too long at wide receiver.')).toBeInTheDocument()
    expect(client).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'draft',
      drafts: [draft],
      messages: [{ role: 'user', content: 'What should I change?' }],
    }))
  })

  it('renders coach Markdown as formatted content', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('### Priority\n\n- Draft a **wide receiver** earlier.')
    render(<CoachPanel scope="draft" drafts={[draft]} onClose={() => undefined} client={client} />)

    await user.type(screen.getByLabelText('Message your coach'), 'What should I change?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Priority', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('wide receiver').tagName).toBe('STRONG')
  })

  it('sends the grading preset prompt with players and notes when the chip is clicked', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('Your draft grades out at 82/100.')
    const players = [{
      id: 'player-1', sleeperId: '4034', name: 'Christian McCaffrey', position: 'RB',
      sourcePositionRank: 1, rank: 1, overallTier: 1, positionTier: 1, auctionValue: 60,
      adp: 1.2, team: 'SF', tags: [], unavailable: false,
    }] as Player[]
    const notes = [{ name: 'draft-strategy', content: 'Anchor RB early.' }]
    render(<CoachPanel scope="draft" drafts={[draft]} players={players} notes={notes} onClose={() => undefined} client={client} />)

    await user.click(screen.getByRole('button', { name: /Grade my draft/ }))

    expect(await screen.findByText('Your draft grades out at 82/100.')).toBeInTheDocument()
    const payload = client.mock.calls[0][0]
    expect(payload.messages[0].role).toBe('user')
    expect(payload.messages[0].content).toContain('give my draft a score out of 100')
    expect(payload.messages[0].content).toContain('use the playback feature')
    expect(payload.players).toEqual([expect.objectContaining({ name: 'Christian McCaffrey', rank: 1 })])
    expect(payload.notes).toEqual(notes)
  })

  it('hides preset prompts once the conversation has started', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('Noted.')
    render(<CoachPanel scope="draft" drafts={[draft]} onClose={() => undefined} client={client} />)

    await user.click(screen.getByRole('button', { name: /Grade my draft/ }))
    await screen.findByText('Noted.')

    expect(screen.queryByRole('button', { name: /Grade my draft/ })).not.toBeInTheDocument()
  })

  it('saves a coach message to memory and includes memories in later requests', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('Trade up for elite tight ends.')
    const savedMemory = {
      id: 'memory-1', content: 'Trade up for elite tight ends.', role: 'assistant' as const,
      scope: 'draft' as const, draftId: 'draft-1', draftName: 'Tuesday mock',
      createdAt: '2026-08-26T12:00:00.000Z',
    }
    const memoryStore = {
      userId: 'user-1',
      list: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(savedMemory),
      delete: vi.fn(),
    }
    render(<CoachPanel scope="draft" drafts={[draft]} memoryStore={memoryStore} onClose={() => undefined} client={client} />)

    await user.type(screen.getByLabelText('Message your coach'), 'What should I change?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Trade up for elite tight ends.')
    const saveButtons = screen.getAllByRole('button', { name: 'Save to coach memory' })
    await user.click(saveButtons[saveButtons.length - 1])

    expect(await screen.findByRole('button', { name: 'Saved to coach memory' })).toBeDisabled()
    expect(memoryStore.save).toHaveBeenCalledWith({
      content: 'Trade up for elite tight ends.',
      role: 'assistant',
      scope: 'draft',
      draftId: 'draft-1',
      draftName: 'Tuesday mock',
    })

    await user.type(screen.getByLabelText('Message your coach'), 'Anything else?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    const secondPayload = client.mock.calls[1][0]
    expect(secondPayload.memories).toEqual([{
      content: 'Trade up for elite tight ends.',
      role: 'assistant',
      draftName: 'Tuesday mock',
      savedAt: '2026-08-26T12:00:00.000Z',
    }])
  })

  it('hides memory saving when no memory store is configured', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('Noted.')
    render(<CoachPanel scope="draft" drafts={[draft]} onClose={() => undefined} client={client} />)

    await user.type(screen.getByLabelText('Message your coach'), 'Review my draft.')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Noted.')

    expect(screen.queryByRole('button', { name: 'Save to coach memory' })).not.toBeInTheDocument()
  })

  it('copies the conversation to the clipboard as a transcript', async () => {
    const user = userEvent.setup()
    const client = vi.fn().mockResolvedValue('Take a WR at the 3-4 turn.')
    render(<CoachPanel scope="draft" drafts={[draft]} onClose={() => undefined} client={client} />)

    expect(screen.getByRole('button', { name: 'Copy chat to clipboard' })).toBeDisabled()

    await user.type(screen.getByLabelText('Message your coach'), 'What should I change?')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Take a WR at the 3-4 turn.')
    await user.click(screen.getByRole('button', { name: 'Copy chat to clipboard' }))

    expect(await screen.findByRole('button', { name: 'Chat copied' })).toBeInTheDocument()
    await expect(window.navigator.clipboard.readText()).resolves.toBe(
      'You:\nWhat should I change?\n\n---\n\nCoach:\nTake a WR at the 3-4 turn.',
    )
  })

  it('offers no presets for history scope', () => {
    render(<CoachPanel scope="history" drafts={[draft]} onClose={() => undefined} client={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Grade my draft/ })).not.toBeInTheDocument()
  })
})
