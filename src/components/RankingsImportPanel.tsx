import { useRef, useState } from 'react'
import { FileUp, UploadCloud, X } from 'lucide-react'
import type { Player } from '../types'
import {
  parseRankingsImport,
  previewRankingsImport,
  type RankingsImportPreview,
} from '../lib/rankingsImport'

interface RankingsImportPanelProps {
  currentPlayers: Player[]
  onApply: (players: Player[]) => void
  onClose: () => void
}

export function RankingsImportPanel({
  currentPlayers,
  onApply,
  onClose,
}: RankingsImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<RankingsImportPreview | null>(null)

  async function readFile(file: File | undefined) {
    setDragActive(false)
    setError('')
    setPreview(null)
    setFileName('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Choose a .csv file to import rankings.')
      return
    }

    try {
      const csvPlayers = parseRankingsImport(await file.text())
      setPreview(previewRankingsImport(currentPlayers, csvPlayers))
      setFileName(file.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that CSV file.')
    }
  }

  return (
    <div className="sync-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="rankings-import" role="dialog" aria-modal="true" aria-label="Import rankings CSV">
        <header className="rankings-import__header">
          <div><span className="eyebrow">BOARD SETUP</span><h2>Import rankings CSV</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close import dialog"><X size={19} /></button>
        </header>
        <div className="rankings-import__body">
          <p>Preview a CSV before safely merging it into your board. Notes, tags, availability, and manual ranking edits are preserved.</p>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose rankings CSV"
            onChange={(event) => {
              void readFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className={dragActive ? 'rankings-dropzone rankings-dropzone--active' : 'rankings-dropzone'}
            aria-label="Drop rankings CSV here or choose a file"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              void readFile(event.dataTransfer.files[0])
            }}
          >
            <UploadCloud size={28} />
            <strong>Drop rankings CSV here or choose a file</strong>
            <span>Required columns are checked before anything changes.</span>
          </button>

          {error && <div className="rankings-import__error" role="alert">{error}</div>}

          {preview && (
            <section className="rankings-preview" aria-label="Import preview">
              <div className="rankings-preview__title">
                <FileUp size={18} />
                <div><strong>Ready to import</strong><span>{fileName}</span></div>
              </div>
              <div className="rankings-preview__counts">
                <span><strong>{preview.players.length}</strong> players</span>
                <span><strong>{preview.matched}</strong> matched</span>
                <span><strong>{preview.added}</strong> added</span>
                <span><strong>{preview.retained}</strong> retained</span>
              </div>
            </section>
          )}

          <div className="rankings-import__actions">
            <button type="button" className="button button--quiet" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="button button--dark"
              disabled={!preview}
              onClick={() => { if (preview) onApply(preview.players) }}
            >
              Apply import
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
