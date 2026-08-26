import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Link,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Unplug,
  X,
} from 'lucide-react'
import type { BoardStore } from './lib/boardStore'
import {
  BOARD_STORAGE_KEY,
  readLocalBoardSnapshot,
  selectInitialBoard,
} from './lib/boardBootstrap'
import { savedDraftFromSleeper, type DraftHistoryStore } from './lib/draftStore'
import type { CoachMemoryStore } from './lib/coachMemoryStore'
import { buildDraftResultsMarkdown, formatRoundPick } from './lib/draftResults'
import {
  deriveFlexTiers,
  derivePositionTiers,
  filterPlayers,
  groupPlayersByDraftPick,
  hydrateGuideNotes,
  movePlayerWithinTier,
  movePlayerToTier,
  resetPlayers,
  resetPlayerRanking,
  sortPlayersByAdp,
} from './lib/rankings'
import type { DraftPickGroup, ResetSelection } from './lib/rankings'
import {
  appendSpecialTeams,
  applyDraftPicks,
  enrichPlayers,
  extractDraftId,
  fetchDraftPicks,
  fetchDraftParticipants,
  fetchDraft,
  fetchDepthChart,
  fetchPlayers,
  fetchProjections,
  fetchSchedule,
  getOffensiveDepthGroups,
  getTeamSchedule,
  resolvePickAttribution,
} from './lib/sleeper'
import { createConfiguredBoardStore, createConfiguredCoachMemoryStore, createConfiguredDraftHistoryStore } from './lib/supabase'
import type {
  Player,
  PlayerTag,
  PositionFilter,
  ScheduleGame,
  SleeperPlayer,
  SleeperPick,
} from './types'
import { DraftsPage } from './components/DraftsPage'
import { DraftDetailPage } from './components/DraftDetailPage'
import { RankingsImportPanel } from './components/RankingsImportPanel'
import { parseAppRoute } from './lib/navigation'
import { readDraftConfigEnv } from './lib/draftConfig'

const POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']

const draftConfig = readDraftConfigEnv(import.meta.env)

const LEAGUE_SIZE = draftConfig.leagueSize
const DRAFT_SLOT = draftConfig.draftSlot

export const TAGS: Array<{ id: PlayerTag; label: string; color: string }> = [
  { id: 'target', label: 'Target', color: '#57d596' },
  { id: 'avoid', label: 'Avoid', color: '#ff6b6b' },
  { id: 'upside', label: 'High upside', color: '#f638b7' },
  { id: 'floor', label: 'Solid floor', color: '#4cc9e8' },
  { id: 'injury', label: 'Injury risk', color: '#ff9f43' },
  { id: 'rookie', label: 'Rookie', color: '#9d8cff' },
  { id: 'ambiguous-role', label: 'Ambiguous role', color: '#e8ca58' },
]

const GUIDE_NOTES: Record<string, string[]> = {
  QB: ['Prioritize mobility', 'Watch touchdown-rate regression', 'Embrace Year 2 variance'],
  RB: ['Value receiving production', 'Attack ambiguous backfields', 'Favor explosive runners late'],
  WR: ['Bet on strong passing attacks', 'Track targets and yards per route', 'Attack ambiguous receiver rooms'],
  TE: ['Look for route volume', 'Target slot usage and depth of target', 'Monitor touchdown regression'],
  K: ['Treat as a final-round position', 'Prefer strong offenses'],
  DEF: ['Stream early matchups', 'Prioritize pressure and turnover upside'],
}

interface AppProps {
  initialCsv?: string
  disableNetwork?: boolean
  boardStore?: BoardStore | null
  draftHistoryStore?: DraftHistoryStore | null
  draftPickFetcher?: typeof fetchDraftPicks
}

export default function App({ initialCsv = '', disableNetwork = false, boardStore, draftHistoryStore, draftPickFetcher = fetchDraftPicks }: AppProps) {
  const configuredBoardStore = useMemo(
    () => boardStore === undefined ? createConfiguredBoardStore() : boardStore,
    [boardStore],
  )
  const initialLocalSnapshot = useRef(readLocalBoardSnapshot())
  const [players, setPlayers] = useState<Player[]>(() =>
    selectInitialBoard(initialLocalSnapshot.current, initialCsv).players,
  )
  const [storeHydrated, setStoreHydrated] = useState(configuredBoardStore === null)
  const [boardMode, setBoardMode] = useState<'tiers' | 'picks' | 'adp'>('tiers')
  const [position, setPosition] = useState<PositionFilter>('ALL')
  const [hideUnavailable, setHideUnavailable] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Record<string, SleeperPlayer>>({})
  const [schedule, setSchedule] = useState<ScheduleGame[]>([])
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'offline'>(
    disableNetwork ? 'offline' : 'loading',
  )
  const [draftSyncOpen, setDraftSyncOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [rankingsImportOpen, setRankingsImportOpen] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftPicks, setDraftPicks] = useState<SleeperPick[]>([])
  const [draftParticipants, setDraftParticipants] = useState<Record<string, string>>({})
  const [draftStatus, setDraftStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle')
  const [draftError, setDraftError] = useState('')
  const [draftSyncing, setDraftSyncing] = useState(false)
  const [historyStore, setHistoryStore] = useState<DraftHistoryStore | null>(draftHistoryStore ?? null)
  const [coachMemoryStore, setCoachMemoryStore] = useState<CoachMemoryStore | null>(null)
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname))
  const draftSyncNowRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const handlePopState = () => setRoute(parseAppRoute(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (draftHistoryStore !== undefined) {
      setHistoryStore(draftHistoryStore)
      return
    }
    let active = true
    void createConfiguredDraftHistoryStore()
      .then((store) => { if (active) setHistoryStore(store) })
      .catch(() => { if (active) setHistoryStore(null) })
    void createConfiguredCoachMemoryStore()
      .then((store) => { if (active) setCoachMemoryStore(store) })
      .catch(() => { if (active) setCoachMemoryStore(null) })
    return () => { active = false }
  }, [draftHistoryStore])

  useEffect(() => {
    if (!configuredBoardStore) {
      setStoreHydrated(true)
      return
    }

    let active = true
    setStoreHydrated(false)
    void configuredBoardStore.load()
      .then(async (snapshot) => {
        if (!active) return
        if (snapshot?.players) {
          setPlayers(hydrateGuideNotes(snapshot.players))
        } else {
          const initialBoard = selectInitialBoard(initialLocalSnapshot.current, initialCsv)
          setPlayers(initialBoard.players)
          await configuredBoardStore.save(initialBoard)
        }
      })
      .catch(() => {
        // Keep the legacy browser state available if the local Supabase stack is down.
      })
      .finally(() => { if (active) setStoreHydrated(true) })

    return () => { active = false }
  }, [configuredBoardStore, initialCsv])

  useEffect(() => {
    if (!configuredBoardStore) {
      localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(players))
      return
    }
    if (!storeHydrated) return

    const timeout = window.setTimeout(() => {
      void configuredBoardStore.save({ players }).catch(() => {
        localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(players))
      })
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [configuredBoardStore, players, storeHydrated])

  useEffect(() => {
    if (disableNetwork) return
    const controller = new AbortController()
    Promise.all([
      fetchPlayers(controller.signal),
      fetchProjections(2026, controller.signal),
      fetchSchedule(2026, controller.signal),
    ])
      .then(([sleeperPlayers, projections, games]) => {
        setCatalog(sleeperPlayers)
        setSchedule(games)
        setPlayers((current) => appendSpecialTeams(enrichPlayers(current, sleeperPlayers, projections), sleeperPlayers, projections))
        setDataStatus('ready')
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setDataStatus('offline')
      })
    return () => controller.abort()
  }, [disableNetwork])

  useEffect(() => {
    if (!draftId) return
    let active = true
    const controller = new AbortController()
    const draftContext = Promise.all([
      fetchDraft(draftId, controller.signal),
      fetchDraftParticipants(draftId, controller.signal),
    ]).then(([draft, participants]) => {
      if (active) setDraftParticipants(participants)
      return { draft, participants }
    })

    const sync = async (manual = false) => {
      if (manual) setDraftSyncing(true)
      try {
        const [picks, context] = await Promise.all([
          draftPickFetcher(draftId, controller.signal, { fresh: true }),
          draftContext,
        ])
        if (!active) return
        setDraftPicks(picks)
        setPlayers((current) => applyDraftPicks(current, picks))
        if (historyStore) {
          await historyStore.save(savedDraftFromSleeper(
            context.draft,
            picks,
            context.participants,
            historyStore.userId,
          )).catch(() => undefined)
        }
        setDraftStatus('live')
        setDraftError('')
      } catch (error) {
        if (!active || (error as Error).name === 'AbortError') return
        setDraftStatus('error')
        setDraftError('Could not read that draft. Check the URL and try again.')
      } finally {
        if (active && manual) setDraftSyncing(false)
      }
    }

    draftSyncNowRef.current = () => { void sync(true) }
    setDraftStatus('connecting')
    void sync()
    const interval = window.setInterval(sync, 5000)
    return () => {
      active = false
      draftSyncNowRef.current = null
      controller.abort()
      window.clearInterval(interval)
    }
  }, [draftId, draftPickFetcher, historyStore])

  const visiblePlayers = useMemo(
    () => filterPlayers(players, { position, hideUnavailable, query }),
    [players, position, hideUnavailable, query],
  )
  const flexTiers = useMemo(() => deriveFlexTiers(players), [players])
  const groupedPlayers = useMemo(() => {
    const groups = new Map<number, Player[]>()
    visiblePlayers.forEach((player) => {
      const group = groups.get(player.overallTier) ?? []
      group.push(player)
      groups.set(player.overallTier, group)
    })
    return [...groups.entries()].sort(([left], [right]) => left - right)
  }, [visiblePlayers])
  const pickGroups = useMemo(
    () => groupPlayersByDraftPick(visiblePlayers, {
      teams: LEAGUE_SIZE,
      draftSlot: DRAFT_SLOT,
      rounds: Math.max(18, Math.ceil(players.length / LEAGUE_SIZE) + 1),
    }),
    [players.length, visiblePlayers],
  )
  const adpPlayers = useMemo(() => sortPlayersByAdp(visiblePlayers), [visiblePlayers])

  const selectedPlayer = players.find((player) => player.id === selectedId) ?? null
  const unavailableCount = players.filter((player) => player.unavailable).length
  const targetCount = players.filter((player) => player.tags.includes('target') && !player.unavailable).length
  const nextOverallPick = draftPicks.reduce((latest, pick) => Math.max(latest, pick.pick_no), 0) + 1
  const nextRoundPick = `${Math.ceil(nextOverallPick / LEAGUE_SIZE)}.${String(((nextOverallPick - 1) % LEAGUE_SIZE) + 1).padStart(2, '0')}`

  function updatePlayer(id: string, update: Partial<Player>) {
    setPlayers((current) => current.map((player) => (player.id === id ? { ...player, ...update } : player)))
  }

  function toggleTag(id: string, tag: PlayerTag) {
    setPlayers((current) =>
      current.map((player) => {
        if (player.id !== id) return player
        const tags = player.tags.includes(tag)
          ? player.tags.filter((candidate) => candidate !== tag)
          : [...player.tags, tag]
        return { ...player, tags }
      }),
    )
  }

  function toggleUnavailable(player: Player) {
    updatePlayer(player.id, {
      unavailable: !player.unavailable,
      unavailableSource: !player.unavailable ? 'manual' : undefined,
    })
  }

  function resetRanking(playerId: string) {
    setPlayers((current) => resetPlayerRanking(current, playerId))
  }

  function moveWithinTier(playerId: string, direction: 'up' | 'down', candidateIds: string[]) {
    setPlayers((current) => movePlayerWithinTier(current, playerId, direction, candidateIds)
      .map((player) => player.id === playerId ? { ...player, rankingEdited: true } : player))
  }

  function resetBoard(selection: ResetSelection) {
    setPlayers((current) => resetPlayers(current, selection))
    setResetOpen(false)
  }

  function connectDraft(input: string) {
    const parsedId = extractDraftId(input)
    if (!parsedId) {
      setDraftError('Paste a valid Sleeper draft URL or ID.')
      return
    }
    setDraftError('')
    setDraftId(parsedId)
  }

  function disconnectDraft() {
    setDraftId(null)
    setDraftStatus('idle')
    setDraftPicks([])
    setDraftParticipants({})
    setPlayers((current) => applyDraftPicks(current, []))
  }

  function runDemoPick() {
    setPlayers((current) => {
      const next = [...current]
        .filter((player) => !player.unavailable)
        .sort((left, right) => (left.adp ?? left.rank) - (right.adp ?? right.rank))[0]
      if (!next) return current
      return current.map((player) => player.id === next.id
        ? { ...player, unavailable: true, unavailableSource: 'manual' }
        : player)
    })
  }

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    setRoute(parseAppRoute(path))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><Star size={18} fill="currentColor" /></div>
          <div>
            <span className="eyebrow">2026 · HALF-PPR</span>
            <strong>War Room</strong>
          </div>
        </div>
        <nav className="top-nav" aria-label="Primary navigation">
          <button type="button" className={route.page === 'board' ? 'top-nav__item top-nav__item--active' : 'top-nav__item'} onClick={() => navigate('/')}>Board</button>
          <button type="button" className={route.page !== 'board' ? 'top-nav__item top-nav__item--active' : 'top-nav__item'} onClick={() => navigate('/drafts')}>Drafts</button>
        </nav>
        <div className={`data-pill data-pill--${dataStatus}`}>
          {dataStatus === 'ready' ? <Cloud size={14} /> : dataStatus === 'loading' ? <CircleDot size={14} /> : <Unplug size={14} />}
          {dataStatus === 'ready' ? 'Sleeper data live' : dataStatus === 'loading' ? 'Loading Sleeper data' : 'Source rankings'}
        </div>
        {route.page === 'board' && <button className="button button--hot" type="button" onClick={() => setDraftSyncOpen(true)}>
          <Sparkles size={16} /> Connect mock draft
        </button>}
      </header>

      {route.page === 'drafts' ? (
        <DraftsPage
          store={historyStore}
          autoImport={!disableNetwork}
          leagueId={draftConfig.leagueId}
          players={players}
          coachMemoryStore={coachMemoryStore}
          onOpenDraft={(selectedDraftId) => navigate(`/drafts/${selectedDraftId}`)}
        />
      ) : route.page === 'draft' ? (
        <DraftDetailPage draftId={route.draftId} store={historyStore} players={players} coachMemoryStore={coachMemoryStore} onBack={() => navigate('/drafts')} />
      ) : <>
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">YOUR BOARD, YOUR CALLS</span>
            <h1>Draft room</h1>
            <p>Re-rank the room. Tag your takes. Let Sleeper clear the board as picks land.</p>
          </div>
          <div className="hero__stats" aria-label="Draft board summary">
            <Stat value={nextRoundPick} label="Round pick" />
            <Stat value={nextOverallPick} label="Overall pick" />
            <Stat value={targetCount} label="Targets" accent />
            <Stat value={unavailableCount} label="Off board" />
          </div>
        </section>

        <section className="controls" aria-label="Ranking controls">
          <div className="board-mode-tabs" aria-label="Board view">
            <button type="button" className={boardMode === 'tiers' ? 'board-mode-tab board-mode-tab--active' : 'board-mode-tab'} onClick={() => setBoardMode('tiers')}>Tier board</button>
            <button type="button" className={boardMode === 'picks' ? 'board-mode-tab board-mode-tab--active' : 'board-mode-tab'} onClick={() => setBoardMode('picks')}>Pick windows</button>
            <button type="button" className={boardMode === 'adp' ? 'board-mode-tab board-mode-tab--active' : 'board-mode-tab'} onClick={() => setBoardMode('adp')}>Sleeper ADP</button>
          </div>
          <div className="position-tabs" aria-label="Position filter">
            {POSITIONS.map((candidate) => (
              <button
                type="button"
                className={position === candidate ? 'position-tab position-tab--active' : 'position-tab'}
                onClick={() => setPosition(candidate)}
                key={candidate}
                aria-label={candidate}
              >
                {candidate === 'ALL' ? 'All' : candidate}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players or teams" />
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={(event) => setHideUnavailable(event.target.checked)}
            />
            <span><EyeOff size={15} /> Hide unavailable</span>
          </label>
          <button type="button" className="button button--quiet" onClick={() => setRankingsImportOpen(true)}>Import CSV</button>
          <button type="button" className="button button--quiet" onClick={() => setResetOpen(true)}>Reset</button>
        </section>

        <section className="board" aria-label="Tiered player rankings">
          <div className="board__intro">
            <div>
              <ArrowUpDown size={18} />
              <strong>{boardMode === 'picks' ? 'Sleeper ADP windows' : boardMode === 'adp' ? 'Sleeper ADP rankings' : position === 'ALL' ? 'Overall board' : `${position} board`}</strong>
              <span>{visiblePlayers.length} players</span>
            </div>
            <p>{boardMode === 'picks' ? `12-team snake · slot ${DRAFT_SLOT}` : boardMode === 'adp' ? 'Half-PPR · lowest ADP first' : <><GripVertical size={14} /> Drag between tiers · use arrows within a tier.</>}</p>
          </div>

          {visiblePlayers.length === 0 ? (
            <EmptyBoard
              position={position}
              hideUnavailable={hideUnavailable}
              onImport={players.length === 0 ? () => setRankingsImportOpen(true) : undefined}
            />
          ) : boardMode === 'picks' ? pickGroups.map((group) => (
            <PickWindowGroup
              key={group.overallPick ?? 'unranked'}
              group={group}
              activeFilter={position}
              flexTiers={flexTiers}
              onSelect={setSelectedId}
              onToggleUnavailable={toggleUnavailable}
              onResetRanking={resetRanking}
            />
          )) : boardMode === 'adp' ? (
            <AdpGroup
              players={adpPlayers}
              activeFilter={position}
              flexTiers={flexTiers}
              onSelect={setSelectedId}
              onToggleUnavailable={toggleUnavailable}
              onResetRanking={resetRanking}
            />
          ) : groupedPlayers.map(([tier, tierPlayers]) => (
            <TierGroup
              key={tier}
              tier={tier}
              players={tierPlayers}
              activeFilter={position}
              flexTiers={flexTiers}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDragEnd={() => setDraggingId(null)}
              onDropTier={() => {
                if (draggingId) {
                  setPlayers((current) => {
                    const draggingPlayer = current.find((player) => player.id === draggingId)
                    if (!draggingPlayer || draggingPlayer.overallTier === tier) return current
                    return movePlayerToTier(current, draggingId, tier)
                      .map((player) => player.id === draggingId ? { ...player, rankingEdited: true } : player)
                  })
                }
                setDraggingId(null)
              }}
              onMovePlayer={moveWithinTier}
              onSelect={setSelectedId}
              onToggleUnavailable={toggleUnavailable}
              onResetRanking={resetRanking}
            />
          ))}
        </section>
      </main>

      {selectedPlayer && (
        <PlayerDetails
          player={selectedPlayer}
          catalog={catalog}
          schedule={schedule}
          onClose={() => setSelectedId(null)}
          onToggleTag={(tag) => toggleTag(selectedPlayer.id, tag)}
          onUpdate={(update) => updatePlayer(selectedPlayer.id, update)}
          onToggleUnavailable={() => toggleUnavailable(selectedPlayer)}
        />
      )}

      {draftSyncOpen && (
        <DraftSyncPanel
          draftId={draftId}
          picks={draftPicks}
          participantNames={draftParticipants}
          status={draftStatus}
          error={draftError}
          onClose={() => setDraftSyncOpen(false)}
          onConnect={connectDraft}
          onDisconnect={disconnectDraft}
          onSyncNow={() => draftSyncNowRef.current?.()}
          syncing={draftSyncing}
          onDemoPick={runDemoPick}
        />
      )}

      {resetOpen && (
        <ResetPanel
          onClose={() => setResetOpen(false)}
          onReset={resetBoard}
        />
      )}

      {rankingsImportOpen && (
        <RankingsImportPanel
          currentPlayers={players}
          onClose={() => setRankingsImportOpen(false)}
          onApply={(importedPlayers) => {
            setPlayers(importedPlayers)
            setRankingsImportOpen(false)
          }}
        />
      )}

      {draftId && !draftSyncOpen && (
        <button type="button" className="sync-toast" onClick={() => setDraftSyncOpen(true)}>
          <span className={draftStatus === 'live' ? 'live-dot' : 'live-dot live-dot--waiting'} />
          <strong>{draftStatus === 'live' ? 'Draft synced' : 'Connecting'}</strong>
          <span>{draftPicks.length} picks</span>
        </button>
      )}
      </>}
    </div>
  )
}

function Stat({ value, label, accent = false }: { value: string | number; label: string; accent?: boolean }) {
  return <div className={accent ? 'stat stat--accent' : 'stat'}><strong>{value}</strong><span>{label}</span></div>
}

function EmptyBoard({
  position,
  hideUnavailable,
  onImport,
}: {
  position: PositionFilter
  hideUnavailable: boolean
  onImport?: () => void
}) {
  return (
    <div className="empty-board">
      <div><Eye size={25} /></div>
      <h2>No {position === 'ALL' ? '' : position} players to show</h2>
      <p>{onImport ? 'Import a rankings CSV to create your draft board.' : position === 'K' || position === 'DEF' ? 'The supplied rankings do not include kickers or defenses.' : hideUnavailable ? 'Try showing unavailable players or clearing your search.' : 'Clear your search to see the board.'}</p>
      {onImport && <button type="button" className="button button--hot" onClick={onImport}>Import rankings CSV</button>}
    </div>
  )
}

function ResetPanel({ onClose, onReset }: { onClose: () => void; onReset: (selection: ResetSelection) => void }) {
  const [selection, setSelection] = useState<ResetSelection>({
    rankings: true,
    tags: false,
    notes: false,
    availability: false,
    all: false,
  })
  const setOption = (option: 'rankings' | 'tags' | 'notes' | 'availability', checked: boolean) => {
    setSelection((current) => ({ ...current, [option]: checked, all: false }))
  }
  const setAll = (checked: boolean) => {
    setSelection(checked
      ? { rankings: false, tags: false, notes: false, availability: false, all: true }
      : { rankings: false, tags: false, notes: false, availability: false, all: false })
  }

  return (
    <div className="sync-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="reset-panel" role="dialog" aria-modal="true" aria-label="Reset draft board">
        <header className="reset-panel__header">
          <div><span className="eyebrow">BOARD SETTINGS</span><h2>Choose what to reset</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close reset dialog"><X size={19} /></button>
        </header>
        <div className="reset-panel__body">
          <label className="reset-option">
            <input aria-label="Reset rankings" type="checkbox" checked={selection.rankings} onChange={(event) => setOption('rankings', event.target.checked)} />
            <span><strong>Reset rankings</strong><small>Restore player order and tiers.</small></span>
          </label>
          <label className="reset-option">
            <input aria-label="Tags" type="checkbox" checked={selection.tags} onChange={(event) => setOption('tags', event.target.checked)} />
            <span><strong>Tags</strong><small>Remove every target, avoid, and player trait tag.</small></span>
          </label>
          <label className="reset-option">
            <input aria-label="Reset notes" type="checkbox" checked={selection.notes} onChange={(event) => setOption('notes', event.target.checked)} />
            <span><strong>Reset notes</strong><small>Remove every player note.</small></span>
          </label>
          <label className="reset-option">
            <input aria-label="Reset availability" type="checkbox" checked={selection.availability} onChange={(event) => setOption('availability', event.target.checked)} />
            <span><strong>Reset availability</strong><small>Restore every player to the board.</small></span>
          </label>
          <label className="reset-option reset-option--all">
            <input aria-label="Reset all" type="checkbox" checked={selection.all} onChange={(event) => setAll(event.target.checked)} />
            <span><strong>Reset all</strong><small>Reset rankings, tags, and availability; restore pre-populated guide notes.</small></span>
          </label>
          <div className="reset-panel__actions">
            <button type="button" className="button button--quiet" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="button button--dark"
              disabled={!selection.rankings && !selection.tags && !selection.notes && !selection.availability && !selection.all}
              onClick={() => onReset(selection)}
            >
              Apply reset
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

interface DraftSyncPanelProps {
  draftId: string | null
  picks: SleeperPick[]
  participantNames: Record<string, string>
  status: 'idle' | 'connecting' | 'live' | 'error'
  error: string
  onClose: () => void
  onConnect: (input: string) => void
  onDisconnect: () => void
  onSyncNow: () => void
  syncing: boolean
  onDemoPick: () => void
}

function DraftSyncPanel({ draftId, picks, participantNames, status, error, onClose, onConnect, onDisconnect, onSyncNow, syncing, onDemoPick }: DraftSyncPanelProps) {
  const [input, setInput] = useState(draftId ?? '')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const recentPicks = [...picks].sort((left, right) => right.pick_no - left.pick_no).slice(0, 5)
  const draftResults = draftId
    ? buildDraftResultsMarkdown({ draftId, picks, participantNames, teams: LEAGUE_SIZE })
    : ''

  async function copyResults() {
    try {
      await navigator.clipboard.writeText(draftResults)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  function saveResults() {
    const blob = new Blob([draftResults], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sleeper-draft-${draftId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="sync-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="sync-panel" role="dialog" aria-modal="true" aria-label="Sleeper mock draft sync">
        <header className="sync-panel__header">
          <div>
            <span className="eyebrow">LIVE BOARD LINK</span>
            <h2>Sleeper mock draft</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close mock draft sync"><X size={19} /></button>
        </header>

        <div className="sync-panel__body">
          <div className="sync-explainer">
            <div><Radio size={21} /></div>
            <div><strong>Picks clear automatically</strong><p>Paste the URL from any Sleeper mock draft. This board checks the public pick feed every five seconds.</p></div>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); onConnect(input) }}>
            <label className="sync-input">
              <span>Sleeper draft URL or ID</span>
              <div><Link size={16} /><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="sleeper.com/draft/nfl/…" /></div>
            </label>
            {error && <p className="sync-error">{error}</p>}
            <div className="sync-actions">
              <button type="submit" className="button button--hot" disabled={status === 'connecting'}>
                {status === 'connecting' ? <><RefreshCw size={15} className="spin" /> Connecting</> : <><Radio size={15} /> Start syncing</>}
              </button>
              {draftId && <button type="button" className="button button--quiet" onClick={onDisconnect}>Disconnect</button>}
              {draftId && (
                <button type="button" className="button button--dark" onClick={onSyncNow} disabled={syncing || status === 'connecting'}>
                  <RefreshCw size={15} className={syncing ? 'spin' : undefined} /> {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              )}
            </div>
          </form>

          {draftId && (
            <div className={`sync-status sync-status--${status}`}>
              <div><span className={status === 'live' ? 'live-dot' : 'live-dot live-dot--waiting'} /><strong>{status === 'live' ? 'Watching draft' : status === 'error' ? 'Connection issue' : 'Connecting to draft'}</strong></div>
              <span>{picks.length} picks received</span>
            </div>
          )}

          {draftId && (
            <div className="draft-export">
              <div><strong>Draft results</strong><span>Round-by-round Markdown</span></div>
              <div className="draft-export__actions">
                <button type="button" className="button button--quiet" disabled={picks.length === 0} onClick={() => void copyResults()}>
                  {copyStatus === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                  {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy results'}
                </button>
                <button type="button" className="button button--dark" disabled={picks.length === 0} onClick={saveResults}>
                  <Download size={15} /> Save .md
                </button>
              </div>
            </div>
          )}

          {recentPicks.length > 0 && (
            <div className="recent-picks">
              <span>Latest picks</span>
              {recentPicks.map((pick) => {
                const name = `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim() || pick.player_id
                return (
                  <div key={`${pick.pick_no}-${pick.player_id}`}>
                    <em>{formatRoundPick(pick, LEAGUE_SIZE)}</em>
                    <div><strong>{name}</strong><small>{pick.metadata?.position ?? 'Player'} · Round {pick.round}</small></div>
                    <span>{resolvePickAttribution(pick, participantNames)}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="demo-box">
            <div><ArrowDownToLine size={17} /><span><strong>Try it without a draft</strong>Remove the best available player one pick at a time.</span></div>
            <button type="button" className="button button--dark" onClick={onDemoPick}>Demo next pick</button>
          </div>
        </div>
      </section>
    </div>
  )
}

interface PickWindowGroupProps {
  group: DraftPickGroup
  activeFilter: PositionFilter
  flexTiers: Map<string, number>
  onSelect: (id: string) => void
  onToggleUnavailable: (player: Player) => void
  onResetRanking: (id: string) => void
}

function PickWindowGroup({ group, activeFilter, flexTiers, onSelect, onToggleUnavailable, onResetRanking }: PickWindowGroupProps) {
  return (
    <article className="tier-group pick-group">
      <header className="tier-group__header pick-group__header">
        <div><span>P</span><h2>{group.label}</h2></div>
        <span>{group.overallPick === null ? 'Unranked by Sleeper' : `Overall pick ${group.overallPick}`}</span>
      </header>
      <div className="tier-group__players">
        {group.players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            activeFilter={activeFilter}
            flexTier={flexTiers.get(player.id)}
            isDragging={false}
            onDragStart={() => undefined}
            onDrop={() => undefined}
            onSelect={() => onSelect(player.id)}
            onToggleUnavailable={() => onToggleUnavailable(player)}
            onResetRanking={() => onResetRanking(player.id)}
            dragEnabled={false}
          />
        ))}
      </div>
    </article>
  )
}

interface AdpGroupProps {
  players: Player[]
  activeFilter: PositionFilter
  flexTiers: Map<string, number>
  onSelect: (id: string) => void
  onToggleUnavailable: (player: Player) => void
  onResetRanking: (id: string) => void
}

function AdpGroup({ players, activeFilter, flexTiers, onSelect, onToggleUnavailable, onResetRanking }: AdpGroupProps) {
  return (
    <article className="tier-group pick-group adp-group">
      <header className="tier-group__header pick-group__header">
        <div><span>A</span><h2>ADP</h2></div>
        <span>Lowest to highest</span>
      </header>
      <div className="tier-group__players">
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            activeFilter={activeFilter}
            flexTier={flexTiers.get(player.id)}
            isDragging={false}
            onDragStart={() => undefined}
            onDrop={() => undefined}
            onSelect={() => onSelect(player.id)}
            onToggleUnavailable={() => onToggleUnavailable(player)}
            onResetRanking={() => onResetRanking(player.id)}
            dragEnabled={false}
          />
        ))}
      </div>
    </article>
  )
}

interface TierGroupProps {
  tier: number
  players: Player[]
  activeFilter: PositionFilter
  flexTiers: Map<string, number>
  draggingId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropTier: () => void
  onMovePlayer: (id: string, direction: 'up' | 'down', candidateIds: string[]) => void
  onSelect: (id: string) => void
  onToggleUnavailable: (player: Player) => void
  onResetRanking: (id: string) => void
}

function TierGroup(props: TierGroupProps) {
  return (
    <article
      className="tier-group"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        if (event.target === event.currentTarget) props.onDropTier()
      }}
    >
      <header className="tier-group__header" onDrop={props.onDropTier}>
        <div><span>T</span><h2>Tier {props.tier}</h2></div>
        <span>{props.players.length} {props.players.length === 1 ? 'player' : 'players'}</span>
      </header>
      <div className="tier-group__players">
        {props.players.map((player, index) => (
          <PlayerCard
            key={player.id}
            player={player}
            activeFilter={props.activeFilter}
            flexTier={props.flexTiers.get(player.id)}
            isDragging={props.draggingId === player.id}
            onDragStart={() => props.onDragStart(player.id)}
            onDragEnd={props.onDragEnd}
            onDrop={props.onDropTier}
            onSelect={() => props.onSelect(player.id)}
            onToggleUnavailable={() => props.onToggleUnavailable(player)}
            onResetRanking={() => props.onResetRanking(player.id)}
            onMoveUp={() => props.onMovePlayer(player.id, 'up', props.players.map((candidate) => candidate.id))}
            onMoveDown={() => props.onMovePlayer(player.id, 'down', props.players.map((candidate) => candidate.id))}
            canMoveUp={index > 0}
            canMoveDown={index < props.players.length - 1}
          />
        ))}
      </div>
    </article>
  )
}

interface PlayerCardProps {
  player: Player
  activeFilter: PositionFilter
  flexTier?: number
  isDragging: boolean
  onDragStart: () => void
  onDragEnd?: () => void
  onDrop: () => void
  onSelect: () => void
  onToggleUnavailable: () => void
  onResetRanking: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  dragEnabled?: boolean
}

function PlayerCard({ player, activeFilter, flexTier, isDragging, onDragStart, onDragEnd, onDrop, onSelect, onToggleUnavailable, onResetRanking, onMoveUp, onMoveDown, canMoveUp = false, canMoveDown = false, dragEnabled = true }: PlayerCardProps) {
  const positionTier = activeFilter === 'FLEX' ? flexTier : player.positionTier
  const showPositionTier = activeFilter !== 'ALL'
  return (
    <div
      className={`player-card player-card--${player.position.toLowerCase()}${player.unavailable ? ' player-card--unavailable' : ''}${isDragging ? ' player-card--dragging' : ''}`}
      draggable={dragEnabled}
      onDragStart={dragEnabled ? onDragStart : undefined}
      onDragEnd={dragEnabled ? onDragEnd : undefined}
      onDragOver={dragEnabled ? (event) => event.preventDefault() : undefined}
      onDrop={dragEnabled ? (event) => { event.stopPropagation(); onDrop() } : undefined}
      data-testid={`player-${player.id}`}
    >
      {dragEnabled ? <GripVertical className="player-card__grip" size={16} aria-hidden="true" /> : <span />}
      <span className="player-card__rank">{player.rank}</span>
      <button type="button" className="player-card__identity" onClick={onSelect}>
        <strong>{player.name}</strong>
        <span>{player.position}{player.team ? ` · ${player.team}` : ''}</span>
      </button>
      <div className="player-card__tiers">
        <span>Overall T{player.overallTier}</span>
        {showPositionTier && <strong>{activeFilter === 'FLEX' ? 'FLEX' : player.position} T{positionTier}</strong>}
        {player.rankingEdited && <em className="ranking-edited">Edited</em>}
      </div>
      <div className="player-card__adp">
        <span>ADP</span>
        <strong>{player.adp && player.adp < 900 ? player.adp.toFixed(1) : '—'}</strong>
      </div>
      <div className="player-card__tags">
        {player.tags.slice(0, 3).map((tagId) => {
          const tag = TAGS.find((candidate) => candidate.id === tagId)!
          return <span className="player-card__tag" style={{ '--tag-color': tag.color } as React.CSSProperties} key={tag.id}>{tag.label}</span>
        })}
        {player.tags.length > 3 && <span className="player-card__tag-more">+{player.tags.length - 3}</span>}
      </div>
      {player.unavailable && <span className="unavailable-label">Unavailable</span>}
      <div className="player-card__actions">
        {onMoveUp && onMoveDown && (
          <div className="ranking-move" aria-label={`Reorder ${player.name} within tier`}>
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Move ${player.name} up within tier`} title="Move up within tier">
              <ChevronUp size={13} />
            </button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Move ${player.name} down within tier`} title="Move down within tier">
              <ChevronDown size={13} />
            </button>
          </div>
        )}
        {player.rankingEdited && (
          <button type="button" className="ranking-reset" onClick={onResetRanking} aria-label={`Reset ${player.name} to original ranking`} title="Reset original ranking">
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          className={player.unavailable ? 'availability-button availability-button--restore' : 'availability-button'}
          onClick={onToggleUnavailable}
          aria-label={`${player.unavailable ? 'Restore' : 'Mark'} ${player.name} ${player.unavailable ? 'to available' : 'unavailable'}`}
          title={player.unavailable ? 'Restore to board' : 'Mark unavailable'}
        >
          {player.unavailable ? <Eye size={16} /> : <Check size={16} />}
        </button>
      </div>
    </div>
  )
}

interface PlayerDetailsProps {
  player: Player
  catalog: Record<string, SleeperPlayer>
  schedule: ScheduleGame[]
  onClose: () => void
  onToggleTag: (tag: PlayerTag) => void
  onUpdate: (update: Partial<Player>) => void
  onToggleUnavailable: () => void
}

function PlayerDetails({ player, catalog, schedule, onClose, onToggleTag, onUpdate, onToggleUnavailable }: PlayerDetailsProps) {
  const [depthChart, setDepthChart] = useState<Record<string, string[]>>({})
  const [depthStatus, setDepthStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => closeRef.current?.focus(), [])
  useEffect(() => {
    if (!player.team) return
    const controller = new AbortController()
    setDepthStatus('loading')
    fetchDepthChart(player.team, controller.signal)
      .then((chart) => { setDepthChart(chart); setDepthStatus('ready') })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setDepthStatus('error')
      })
    return () => controller.abort()
  }, [player.team])

  const teamSchedule = player.team ? getTeamSchedule(schedule, player.team) : []
  const gamesByWeek = new Map(teamSchedule.map((game) => [game.week, game]))
  const notes = GUIDE_NOTES[player.position] ?? []
  const depthGroups = getOffensiveDepthGroups(depthChart)

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="player-drawer" role="dialog" aria-modal="true" aria-label={`${player.name} details`}>
        <header className="player-drawer__header">
          <span className="eyebrow">PLAYER DOSSIER</span>
          <button ref={closeRef} type="button" onClick={onClose} className="icon-button" aria-label="Close player details"><X /></button>
        </header>

        <section className="player-hero">
          <div className="player-hero__photo">
            {player.sleeperId ? <img src={`https://sleepercdn.com/content/nfl/players/${player.sleeperId}.jpg`} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : <span>{player.position}</span>}
          </div>
          <div>
            <div className="position-line"><span>{player.position}</span>{player.team && <span>{player.team}</span>}{player.injuryStatus && <span className="injury-pill">{player.injuryStatus}</span>}</div>
            <h2>{player.name}</h2>
            <p>#{player.rank} overall · Tier {player.overallTier} · {player.position} tier {player.positionTier}</p>
          </div>
        </section>

        <section className="detail-metrics">
          <div><span>Sleeper ADP</span><strong>{player.adp && player.adp < 900 ? player.adp.toFixed(1) : '—'}</strong></div>
          <div><span>Auction</span><strong>${player.auctionValue}</strong></div>
          <div><span>Depth</span><strong>{player.depthChartOrder ? `#${player.depthChartOrder}` : '—'}</strong></div>
        </section>

        <section className="drawer-section">
          <div className="section-title"><div><span>01</span><h3>Your read</h3></div><p>Tap to tag</p></div>
          <div className="tag-picker">
            {TAGS.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className={player.tags.includes(tag.id) ? 'tag-button tag-button--active' : 'tag-button'}
                style={{ '--tag-color': tag.color } as React.CSSProperties}
                onClick={() => onToggleTag(tag.id)}
                aria-label={`Toggle ${tag.label} tag`}
              >
                <span />{tag.label}{player.tags.includes(tag.id) && <Check size={13} />}
              </button>
            ))}
          </div>
          <label className="notes-field">
            <span>Draft note</span>
            <textarea value={player.note ?? ''} onChange={(event) => onUpdate({ note: event.target.value, noteEdited: true })} placeholder="What would make you pull the trigger?" />
          </label>
        </section>

        <section className="drawer-section">
          <div className="section-title"><div><span>02</span><h3>Strategy lens</h3></div><p>From your guide</p></div>
          <div className="strategy-notes">
            {notes.map((note) => <div key={note}><Sparkles size={14} /><span>{note}</span></div>)}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-title"><div><span>03</span><h3>Depth chart</h3></div><p>{player.team ?? 'Team unavailable'}</p></div>
          {depthStatus === 'loading' ? <div className="skeleton-block">Loading the room…</div> : (
            <div className="depth-chart">
              {['QB', 'RB', 'WR', 'TE'].map((group) => (
                <div className="depth-row" key={group}>
                  <strong>{group}</strong>
                  <div>
                    {depthGroups[group as keyof typeof depthGroups].slice(0, group === 'WR' ? 5 : 3).map((id, index) => (
                      <span className={id === player.sleeperId ? 'depth-player depth-player--active' : 'depth-player'} key={id}>
                        <em>{index + 1}</em>{catalog[id]?.full_name ?? (`${catalog[id]?.first_name ?? ''} ${catalog[id]?.last_name ?? ''}`.trim() || id)}
                      </span>
                    ))}
                    {depthStatus === 'error' && <span className="muted-copy">Depth chart unavailable</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section">
          <div className="section-title"><div><span>04</span><h3>2026 schedule</h3></div><p>Regular season</p></div>
          <div className="schedule-grid">
            {Array.from({ length: 18 }, (_, index) => index + 1).map((week) => {
              const game = gamesByWeek.get(week)
              return <div className={game ? 'schedule-game' : 'schedule-game schedule-game--bye'} key={week}><span>W{week}</span><strong>{game ? `${game.venue === 'away' ? '@' : 'vs'} ${game.opponent}` : 'BYE'}</strong></div>
            })}
          </div>
        </section>

        <footer className="drawer-actions">
          <button type="button" className={player.unavailable ? 'button button--quiet' : 'button button--dark'} onClick={onToggleUnavailable}>
            {player.unavailable ? <><Eye size={16} /> Restore</> : <><Check size={16} /> Mark unavailable</>}
          </button>
        </footer>
      </aside>
    </div>
  )
}
