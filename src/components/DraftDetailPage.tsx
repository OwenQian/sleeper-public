import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, History, RotateCcw } from 'lucide-react'
import type { DraftHistoryStore } from '../lib/draftStore'
import { formatRoundPick } from '../lib/draftResults'
import { buildReplayState, calculateTeamAuctionPower } from '../lib/draftReplay'
import type { Player, SavedDraft, SleeperPick } from '../types'
import type { CoachMemoryStore } from '../lib/coachMemoryStore'
import { CoachPanel } from './CoachPanel'

interface DraftDetailPageProps {
  draftId: string
  store: DraftHistoryStore | null
  players: Player[]
  coachMemoryStore?: CoachMemoryStore | null
  onBack: () => void
}

function pickName(pick: SleeperPick): string {
  return `${pick.metadata?.first_name ?? ''} ${pick.metadata?.last_name ?? ''}`.trim() || pick.player_id
}

export function DraftDetailPage({ draftId, store, players, coachMemoryStore = null, onBack }: DraftDetailPageProps) {
  const [draft, setDraft] = useState<SavedDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPick, setSelectedPick] = useState<SleeperPick | null>(null)
  const [replayPickNo, setReplayPickNo] = useState<number | null>(null)
  const [coachOpen, setCoachOpen] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    if (!store) {
      setLoading(false)
      return
    }
    void store.get(draftId)
      .then((saved) => { if (active) setDraft(saved) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [draftId, store])

  const replay = useMemo(
    () => draft ? buildReplayState(draft, players, replayPickNo ?? Number.POSITIVE_INFINITY) : null,
    [draft, players, replayPickNo],
  )
  const teamAuctionPower = useMemo(
    () => draft ? calculateTeamAuctionPower(draft, players) : {},
    [draft, players],
  )

  if (loading) return <main className="draft-detail-page"><div className="history-empty"><h1>Loading draft</h1></div></main>
  if (!draft) return (
    <main className="draft-detail-page">
      <button type="button" className="button button--quiet" onClick={onBack}><ArrowLeft size={15} /> Draft history</button>
      <div className="history-empty"><h1>Draft not found</h1><p>Refresh your Sleeper drafts and try again.</p></div>
    </main>
  )

  const slots = Array.from({ length: draft.teams }, (_, index) => index + 1)
  const replayLabel = replayPickNo === null
    ? 'Full draft'
    : `Replay after ${formatRoundPick(draft.picks.find((pick) => pick.pick_no === replayPickNo)!, draft.teams)}`

  return (
    <main className="draft-detail-page">
      <section className="draft-detail-header">
        <div>
          <button type="button" className="text-button" onClick={onBack}><ArrowLeft size={14} /> Draft history</button>
          <span className="eyebrow">DRAFT FILM</span>
          <h1>{draft.name}</h1>
          <p>{draft.teams} teams · {draft.rounds} rounds · {draft.picks.length} total picks</p>
        </div>
        <div className="replay-controls">
          <div><History size={17} /><span><strong>{replayLabel}</strong><small>{replayPickNo ?? replay?.draftedPicks.length ?? 0} picks made</small></span></div>
          {selectedPick && (
            <button type="button" className="button button--hot" onClick={() => setReplayPickNo(selectedPick.pick_no)}>
              Jump back to {formatRoundPick(selectedPick, draft.teams)}
            </button>
          )}
          <button type="button" className="button button--dark" onClick={() => setCoachOpen(true)}>Coach this draft</button>
          {replayPickNo !== null && <button type="button" className="button button--quiet" onClick={() => setReplayPickNo(null)}><RotateCcw size={14} /> Full draft</button>}
        </div>
      </section>

      <section className="draft-visualization" aria-label="Draft board visualization">
        <div className="draft-visualization__grid" style={{ '--draft-teams': draft.teams } as React.CSSProperties}>
          {slots.map((slot) => {
            const slotOwner = slot === draft.draftSlot
              ? draft.participants[draft.sleeperUserId]
              : draft.participants[draft.picks.find((pick) => pick.draft_slot === slot && pick.picked_by)?.picked_by ?? '']
            return (
              <div className={slot === draft.draftSlot ? 'draft-team-header draft-team-header--you' : 'draft-team-header'} data-testid="draft-team-header" key={slot} style={{ gridColumn: slot, gridRow: 1 }}>
                <strong>{slotOwner ?? `Team ${slot}`}</strong>
                <span>Slot {slot}</span>
                <span className="draft-team-power">Power ${teamAuctionPower[slot] ?? 0}</span>
              </div>
            )
          })}
          {draft.picks.map((pick) => {
            const notation = formatRoundPick(pick, draft.teams)
            const future = replayPickNo !== null && pick.pick_no > replayPickNo
            const position = pick.metadata?.position?.toLowerCase() ?? 'player'
            return (
              <button
                type="button"
                key={`${pick.pick_no}-${pick.player_id}`}
                data-testid={`draft-pick-${pick.pick_no}`}
                aria-label={`Select pick ${notation}`}
                className={`draft-pick draft-pick--${position}${selectedPick?.pick_no === pick.pick_no ? ' draft-pick--selected' : ''}${future ? ' draft-pick--future' : ''}`}
                style={{ gridColumn: pick.draft_slot, gridRow: pick.round + 1 }}
                onClick={() => setSelectedPick(pick)}
              >
                <span>{pickName(pick)}</span>
                <small>{pick.metadata?.position ?? 'Player'} · {notation}</small>
              </button>
            )
          })}
        </div>
      </section>

      {replay && (
        <section className="replay-pool" aria-label="Replay player pool">
          <div>
            <span className="eyebrow">STILL ON THE BOARD</span>
            <h2>Available at this point</h2>
            <div className="replay-player-list">{replay.availablePlayers.slice(0, 60).map((player) => <span key={player.id}>{player.name}<small>{player.position}</small></span>)}</div>
          </div>
          <div>
            <span className="eyebrow">PICKS THROUGH THIS POINT</span>
            <h2>Unavailable</h2>
            <div className="replay-player-list replay-player-list--off">{replay.unavailablePlayers.map((player) => <span key={player.id}>{player.name}<small>{player.position}</small></span>)}</div>
          </div>
        </section>
      )}
      {coachOpen && <CoachPanel scope="draft" drafts={[draft]} players={players} memoryStore={coachMemoryStore} onClose={() => setCoachOpen(false)} />}
    </main>
  )
}
