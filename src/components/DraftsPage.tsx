import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CloudDownload, Link2, RefreshCw, X } from 'lucide-react'
import type { DraftHistoryStore } from '../lib/draftStore'
import { importSleeperDrafts } from '../lib/draftImport'
import {
  importSleeperMockDraftIds,
  parseSleeperMockImportIds,
} from '../lib/mockHistoryImport'
import type { Player, SavedDraft } from '../types'
import { CoachPanel } from './CoachPanel'
import draftConfig from '../data/draft-config.json'

interface DraftsPageProps {
  store: DraftHistoryStore | null
  onOpenDraft: (draftId: string) => void
  autoImport?: boolean
  importDrafts?: typeof importSleeperDrafts
  importMockDrafts?: typeof importSleeperMockDraftIds
  leagueId?: string | null
  players?: Player[]
}

function isMockDraft(draft: SavedDraft): boolean {
  const metadataType = typeof draft.metadata.type === 'string' ? draft.metadata.type : ''
  return draft.leagueId === null || draft.type === 'mock' || metadataType.includes('mock')
}

export function DraftsPage({
  store,
  onOpenDraft,
  autoImport = true,
  importDrafts = importSleeperDrafts,
  importMockDrafts = importSleeperMockDraftIds,
  leagueId = draftConfig.leagueId,
  players = [],
}: DraftsPageProps) {
  const [drafts, setDrafts] = useState<SavedDraft[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'importing' | 'error'>(store ? 'loading' : 'ready')
  const [syncMessage, setSyncMessage] = useState('')
  const [coachOpen, setCoachOpen] = useState(false)
  const [mockImportOpen, setMockImportOpen] = useState(false)
  const [mockImportInput, setMockImportInput] = useState('')

  const load = useCallback(async () => {
    if (!store) return
    const saved = await store.list()
    setDrafts(saved)
  }, [store])

  const sync = useCallback(async () => {
    if (!store) return
    setStatus('importing')
    setSyncMessage('')
    try {
      const imported = await importDrafts(store)
      await load()
      setStatus('ready')
      setSyncMessage(`Synced ${imported} Sleeper draft${imported === 1 ? '' : 's'}.`)
    } catch (error) {
      setStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Sleeper draft refresh failed.')
    }
  }, [importDrafts, load, store])

  const importEnteredMocks = useCallback(async () => {
    if (!store) return
    if (!leagueId) {
      setStatus('error')
      setSyncMessage('Add VITE_SLEEPER_LEAGUE_ID before importing practice mocks.')
      return
    }
    const mockIds = parseSleeperMockImportIds(mockImportInput)
    if (mockIds.length === 0) {
      setStatus('error')
      setSyncMessage('Enter at least one valid Sleeper mock draft link or ID.')
      return
    }
    setStatus('importing')
    setSyncMessage('')
    try {
      const imported = await importMockDrafts(store, mockIds, leagueId)
      await load()
      setStatus('ready')
      setSyncMessage(`Imported ${imported} practice mock${imported === 1 ? '' : 's'}.`)
      setMockImportInput('')
      setMockImportOpen(false)
    } catch (error) {
      setStatus('error')
      setSyncMessage(error instanceof Error ? error.message : 'Practice mock import failed.')
    }
  }, [importMockDrafts, leagueId, load, mockImportInput, store])

  useEffect(() => {
    let active = true
    if (!store) return
    void load()
      .then(() => active && setStatus('ready'))
      .then(() => {
        if (!active) return
        if (autoImport) return sync()
      })
      .catch(() => { if (active) setStatus('error') })
    return () => { active = false }
  }, [autoImport, load, store, sync])

  return (
    <main className="drafts-page">
      <section className="drafts-hero">
        <div>
          <span className="eyebrow">FILM ROOM</span>
          <h1>Draft history</h1>
          <p>Replay your Sleeper mocks, study roster construction, and ask your coach what to change next time.</p>
        </div>
        <div className="drafts-hero__actions">
          <button type="button" className="button button--hot" disabled={drafts.length === 0} onClick={() => setCoachOpen(true)}>Coach</button>
          <button type="button" className="button button--quiet" disabled={!store || !leagueId} onClick={() => { setSyncMessage(''); setMockImportOpen(true) }}>
            <Link2 size={16} /> Import practice mocks
          </button>
          <button type="button" className="button button--dark" disabled={!store || status === 'importing'} onClick={() => void sync()}>
            <RefreshCw size={16} className={status === 'importing' ? 'spin' : undefined} />
            {status === 'importing' ? 'Importing…' : 'Refresh Sleeper drafts'}
          </button>
        </div>
      </section>

      {syncMessage && (
        <p className={status === 'error' ? 'draft-sync-message draft-sync-message--error' : 'draft-sync-message'} role="status">
          {syncMessage}
        </p>
      )}

      {!store ? (
        <div className="history-empty">
          <CloudDownload size={24} />
          <h2>Connect local Supabase</h2>
          <p>Add the Supabase URL, anon key, and Sleeper username to load draft history.</p>
        </div>
      ) : status === 'loading' ? (
        <div className="history-empty"><RefreshCw size={24} className="spin" /><h2>Loading drafts</h2></div>
      ) : drafts.length === 0 ? (
        <div className="history-empty">
          <CloudDownload size={24} />
          <h2>No saved drafts yet</h2>
          <p>Connect a mock from the board or refresh to import drafts from your Sleeper history.</p>
        </div>
      ) : (
        <section className="draft-history-grid" aria-label="Saved drafts">
          {drafts.map((draft) => (
            <article className={isMockDraft(draft) ? 'draft-history-card draft-history-card--mock' : 'draft-history-card'} data-testid="draft-card" key={draft.draftId}>
              <div className="draft-history-card__meta">
                <span>{isMockDraft(draft) && <strong className="draft-history-card__mock-label">Mock draft</strong>}{draft.type} · {draft.teams} teams</span>
                <span>{draft.status}</span>
              </div>
              <h2>{draft.name}</h2>
              <p>{draft.picks.length} picks · {draft.rounds} rounds · Slot {draft.draftSlot ?? '—'}</p>
              <div className="draft-history-card__footer">
                <time dateTime={draft.createdAt ?? draft.syncedAt}>{new Date(draft.createdAt ?? draft.syncedAt).toLocaleDateString()}</time>
                <button type="button" className="button button--quiet" aria-label={`Review ${draft.name}`} onClick={() => onOpenDraft(draft.draftId)}>
                  Review <ArrowRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      {coachOpen && <CoachPanel scope="history" drafts={drafts.slice(0, 8)} players={players} onClose={() => setCoachOpen(false)} />}
      {mockImportOpen && (
        <div className="sync-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMockImportOpen(false) }}>
          <section className="sync-panel" role="dialog" aria-modal="true" aria-label="Import Sleeper practice mocks">
            <header className="sync-panel__header">
              <div><span className="eyebrow">ONE-TIME BRIDGE</span><h2>Import practice mocks</h2></div>
              <button type="button" className="icon-button" onClick={() => setMockImportOpen(false)} aria-label="Close practice mock importer"><X size={19} /></button>
            </header>
            <form className="sync-panel__body mock-import-body" onSubmit={(event) => { event.preventDefault(); void importEnteredMocks() }}>
              <p>Paste a Sleeper mock draft link or ID. To import several mocks at once, separate them with commas.</p>
              <label className="mock-import-field">
                <span>Sleeper mock draft links or IDs</span>
                <textarea
                  aria-label="Sleeper mock draft links or IDs"
                  value={mockImportInput}
                  onChange={(event) => setMockImportInput(event.target.value)}
                  placeholder="https://sleeper.com/draft/nfl/… , 1300000000000000002"
                  rows={4}
                />
                <small>Accepted: full Sleeper draft URLs or 16–20 digit draft IDs.</small>
              </label>
              {status === 'error' && syncMessage && <p className="sync-error" role="alert">{syncMessage}</p>}
              <div className="sync-actions">
                <button type="submit" className="button button--dark" disabled={status === 'importing'}>
                  {status === 'importing' ? 'Importing…' : 'Import mocks'}
                </button>
                <button type="button" className="button button--quiet" onClick={() => setMockImportOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
