# Draft workflow

1. Reorder players within a tier with the card arrows; drag a card onto another tier to change tiers.
2. Moved players get an **Edited** marker; use their reset button to restore the latest imported source rank and tier.
3. Switch to **Pick windows** to group players by upcoming snake-draft picks, or **Sleeper ADP** for a flat lowest-to-highest ADP board.
4. Open a player to tag, annotate, view the offensive depth chart, or scan the schedule.
5. Start a Sleeper draft, select **Connect mock draft**, and paste its URL.
6. Drafted players are reconciled from Sleeper every five seconds and hidden by default. Use **Sync now** to refresh immediately.
7. Open **Drafts** to import and review the configured user's Sleeper drafts.
8. Use **Coach** from draft history for an eight-draft review, or **Coach this draft** for one session (see [coach.md](coach.md)).

The Sleeper connection is read-only and needs no credential.

## Resetting

The board-level reset dialog restores imported rankings by default. Tags, notes, and availability can each be reset separately — resetting notes restores each player's imported source note (or clears the note when none exists) — while **Reset all** exclusively restores rankings and resets all three.

## Rankings import details

Imports are non-destructive:

- Matching players receive the CSV's source rank, tier, position rank, and auction value.
- Tags, notes, availability, Sleeper enrichment, and manually edited ranking placement are preserved.
- New CSV players are added.
- Existing players missing from the CSV are retained at the bottom.
- Final ranks are normalized to a contiguous order.

Supported positions are `QB`, `RB`, `WR`, `TE`, `K`, and `DEF`. Ranks, position ranks, and tiers must be positive numbers. Invalid headers or rows are reported before the import can be applied.

A browser can read a local file only after you explicitly drop or select it. It cannot freely read filesystem paths or write the CSV into the repository, so the app persists parsed `Player[]` state instead of a file handle or raw CSV.
