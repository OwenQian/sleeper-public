import { useState } from 'react'
import { Bot, Send, Sparkles, X } from 'lucide-react'
import {
  buildCoachPayload,
  COACH_PRESETS,
  requestCoach,
  type CoachClient,
  type CoachMessage,
  type CoachScope,
} from '../lib/coach'
import { loadCoachNotes, type CoachNote } from '../lib/coachNotes'
import type { Player, SavedDraft } from '../types'

interface CoachPanelProps {
  scope: CoachScope
  drafts: SavedDraft[]
  onClose: () => void
  client?: CoachClient
  players?: Player[]
  notes?: CoachNote[]
}

export function CoachPanel({
  scope,
  drafts,
  onClose,
  client = requestCoach,
  players = [],
  notes = loadCoachNotes(),
}: CoachPanelProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const presets = COACH_PRESETS[scope]

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || sending) return
    const nextMessages: CoachMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError('')
    try {
      const answer = await client(buildCoachPayload(scope, drafts, nextMessages, players, notes))
      setMessages((current) => [...current, { role: 'assistant', content: answer }])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The coach could not answer right now.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="coach-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="coach-panel" role="dialog" aria-modal="true" aria-label="Fantasy football coach">
        <header className="coach-panel__header">
          <div><Bot size={21} /><span><strong>Draft coach</strong><small>{scope === 'history' ? `Last ${Math.min(8, drafts.length)} drafts` : drafts[0]?.name ?? 'Current draft'}</small></span></div>
          <button type="button" className="icon-button" aria-label="Close coach" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="coach-messages">
          <div className="coach-message coach-message--assistant">
            {scope === 'history'
              ? 'I have your latest draft history. Ask me about recurring roster-building patterns, reaches, values, or position timing.'
              : 'I have this draft only. Ask me to review a pick, compare alternatives, or identify the turning points.'}
          </div>
          {messages.length === 0 && presets.length > 0 && (
            <div className="coach-presets">
              {presets.map((preset) => (
                <button
                  type="button"
                  className="coach-preset"
                  key={preset.label}
                  disabled={sending}
                  onClick={() => void sendMessage(preset.prompt)}
                >
                  <Sparkles size={14} /> {preset.label}
                </button>
              ))}
            </div>
          )}
          {messages.map((message, index) => <div className={`coach-message coach-message--${message.role}`} key={`${message.role}-${index}`}>{message.content}</div>)}
          {sending && <div className="coach-message coach-message--assistant coach-message--thinking">Reviewing your drafts…</div>}
          {error && <p className="coach-error">{error}</p>}
        </div>
        <form className="coach-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(input) }}>
          <label>
            <span>Message your coach</span>
            <textarea aria-label="Message your coach" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Where am I consistently losing value?" />
          </label>
          <button type="submit" className="button button--hot" aria-label="Send" disabled={sending || !input.trim()}><Send size={16} /> Send</button>
        </form>
      </section>
    </div>
  )
}
