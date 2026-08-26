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

  it('offers no presets for history scope', () => {
    render(<CoachPanel scope="history" drafts={[draft]} onClose={() => undefined} client={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Grade my draft/ })).not.toBeInTheDocument()
  })
})
