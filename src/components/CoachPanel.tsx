import { useEffect, useState } from 'react'
import { Bookmark, BookmarkCheck, Bot, Check, Copy, Send, Sparkles, X } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  buildCoachPayload,
  COACH_PRESETS,
  requestCoach,
  type CoachClient,
  type CoachMessage,
  type CoachScope,
} from '../lib/coach'
import { loadCoachNotes, type CoachNote } from '../lib/coachNotes'
import type { CoachMemory, CoachMemoryStore } from '../lib/coachMemoryStore'
import type { Player, SavedDraft } from '../types'

interface CoachPanelProps {
  scope: CoachScope
  drafts: SavedDraft[]
  onClose: () => void
  client?: CoachClient
  players?: Player[]
  notes?: CoachNote[]
  memoryStore?: CoachMemoryStore | null
}

export function CoachPanel({
  scope,
  drafts,
  onClose,
  client = requestCoach,
  players = [],
  notes = loadCoachNotes(),
  memoryStore = null,
}: CoachPanelProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [memories, setMemories] = useState<CoachMemory[]>([])
  const [savedIndexes, setSavedIndexes] = useState<Set<number>>(new Set())
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const presets = COACH_PRESETS[scope]

  useEffect(() => {
    let active = true
    if (!memoryStore) return
    void memoryStore.list()
      .then((saved) => { if (active) setMemories(saved) })
      .catch(() => undefined)
    return () => { active = false }
  }, [memoryStore])

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || sending) return
    const nextMessages: CoachMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError('')
    try {
      const answer = await client(buildCoachPayload(scope, drafts, nextMessages, players, notes, memories))
      setMessages((current) => [...current, { role: 'assistant', content: answer }])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The coach could not answer right now.')
    } finally {
      setSending(false)
    }
  }

  async function copyChat() {
    if (messages.length === 0) return
    const transcript = messages
      .map((message) => `${message.role === 'user' ? 'You' : 'Coach'}:\n${message.content}`)
      .join('\n\n---\n\n')
    try {
      await navigator.clipboard.writeText(transcript)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copying the chat to the clipboard failed.')
    }
  }

  async function saveMemory(message: CoachMessage, index: number) {
    if (!memoryStore || savedIndexes.has(index) || savingIndex !== null) return
    setSavingIndex(index)
    setError('')
    try {
      const saved = await memoryStore.save({
        content: message.content,
        role: message.role,
        scope,
        draftId: scope === 'draft' ? drafts[0]?.draftId ?? null : null,
        draftName: scope === 'draft' ? drafts[0]?.name ?? null : null,
      })
      setMemories((current) => [saved, ...current])
      setSavedIndexes((current) => new Set(current).add(index))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Saving to coach memory failed.')
    } finally {
      setSavingIndex(null)
    }
  }

  return (
    <div className="coach-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="coach-panel" role="dialog" aria-modal="true" aria-label="Fantasy football coach">
        <header className="coach-panel__header">
          <div><Bot size={21} /><span><strong>Draft coach</strong><small>{scope === 'history' ? `Last ${Math.min(8, drafts.length)} drafts` : drafts[0]?.name ?? 'Current draft'}</small></span></div>
          <div className="coach-panel__header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={copied ? 'Chat copied' : 'Copy chat to clipboard'}
              title={copied ? 'Chat copied' : 'Copy chat to clipboard'}
              disabled={messages.length === 0}
              onClick={() => void copyChat()}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button type="button" className="icon-button" aria-label="Close coach" onClick={onClose}><X size={18} /></button>
          </div>
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
          {messages.map((message, index) => (
            <div className={`coach-message-row coach-message-row--${message.role}`} key={`${message.role}-${index}`}>
              <div className={`coach-message coach-message--${message.role}`}>
                {message.role === 'assistant'
                  ? <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  : message.content}
              </div>
              {memoryStore && (
                <button
                  type="button"
                  className={savedIndexes.has(index) ? 'coach-memory-save coach-memory-save--saved' : 'coach-memory-save'}
                  aria-label={savedIndexes.has(index) ? 'Saved to coach memory' : 'Save to coach memory'}
                  title={savedIndexes.has(index) ? 'Saved to coach memory' : 'Save to coach memory'}
                  disabled={savedIndexes.has(index) || savingIndex !== null}
                  onClick={() => void saveMemory(message, index)}
                >
                  {savedIndexes.has(index) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>
              )}
            </div>
          ))}
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
