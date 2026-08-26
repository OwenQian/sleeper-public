# 2026 Draft Room

An interactive half-PPR draft companion built around your rankings. It combines a persistent personal tier board with live Sleeper data and a public mock-draft pick feed.

## Add your rankings CSV

1. Create the `src/data` folder if it does not already exist.
2. In Finder, drag your rankings CSV into `src/data`.
3. Rename the file to `rankings.csv`.

The CSV must use these columns in this order: `Overall`, `Player`, `Position`, `Pos Rank`, `Tier`, and `Auction (Out of $200)`. The app imports `src/data/rankings.csv` at build time, so add the file before running the app. The entire `src/data` folder is ignored by Git to keep rankings and generated draft configuration out of the repository.

## Run it

```bash
npm install
mkdir -p src/data
cp draft-config.example.json src/data/draft-config.json
cp .env.example .env.local
npm run supabase:start
npm run supabase:status
npm run supabase:migrate
npm run dev
```

Copy the local `ANON_KEY` (or `PUBLISHABLE_KEY`) from `npm run supabase:status` into `VITE_SUPABASE_ANON_KEY` in `.env.local`. Set `VITE_SLEEPER_LEAGUE_ID` and `VITE_SLEEPER_USERNAME` to scope your board and draft history. The username is resolved through Sleeper and the stable returned user ID is stored internally.

To use the coach, add `OPENAI_API_KEY` to `.env.local`, then run `npm run coach:serve` in a second terminal alongside `npm run dev`. The key has no `VITE_` prefix and is read only by the local Supabase Edge Function. `OPENAI_COACH_MODEL` defaults to `gpt-5.6` and can be changed in `.env.local`. Supabase Studio is available at `http://127.0.0.1:54323`.

The coach function only accepts browser requests from `localhost`/`127.0.0.1` origins, so other websites open in your browser cannot spend your OpenAI key while the stack is running. Set `COACH_ALLOWED_ORIGINS` (comma-separated) in `.env.local` if you serve the app from a different origin.

## Draft workflow

1. Reorder players within a tier with the card arrows; drag a card onto another tier to change tiers.
2. Moved players get an **Edited** marker; use their reset button to restore the source rank and tier.
3. Switch to **Pick windows** to group players by upcoming snake-draft picks, or **Sleeper ADP** for a flat lowest-to-highest ADP board.
4. Open a player to tag, annotate, view the offensive depth chart, or scan the schedule.
5. Start a Sleeper draft, select **Connect mock draft**, and paste its URL.
6. Drafted players are reconciled from Sleeper every five seconds and hidden by default. Use **Sync now** in the draft panel to refresh immediately.
7. Recent picks use round-and-pick notation such as **4.01**. Copy the complete results or save them as a round-grouped Markdown file from the draft panel.
8. Open **Drafts** in the primary navigation to import and review the configured user's Sleeper mock drafts. Every successfully synced draft is also upserted automatically.
9. Select a draft pick and choose **Jump back** to mask later picks and reconstruct the available and unavailable player pool at that point.
10. Use **Coach** from draft history for an eight-draft review, or **Coach this draft** for a session scoped to one draft.
11. In a draft-scoped coach session, the **Grade my draft** preset asks for a 0–100 score with a pick-by-pick review. The coach has a playback tool that reconstructs the exact available-player pool at any pick, so grades and suggested alternatives reflect who was actually on the board.
12. Drop markdown files into the `coach-notes/` directory to build the coach's knowledge base — strategy, league tendencies, player takes. Every note is sent with each coaching request (see `coach-notes/README.md`). The coach is preconfigured with the league settings: 0.5 PPR with a 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX / 1 K / 1 DST starting lineup.

The board-level reset dialog restores rankings by default. Tags can be cleared separately, while **Reset all** exclusively restores rankings and clears tags, notes, and availability.

The Sleeper connection is read-only and needs no credentials. Manual availability, notes, tags, and ranking changes are saved to the local Supabase Docker stack. Existing browser-local state is migrated the first time a board connects; browser storage remains a fallback when Supabase is unavailable. The source CSV contains no kickers or defenses, so the app supplements the 15 highest-ADP options at each position after Sleeper data loads.

## Data behavior

- Source rankings: your local `src/data/rankings.csv` file
- Live enrichment: Sleeper player catalog, half-PPR projections/ADP, team depth charts, and the 2026 regular-season schedule
- Mock drafts: Sleeper's public `draft/{draft_id}/picks` feed
- Offline fallback: your rankings remain fully usable without enrichment

## Local persistence

The migrations in `supabase/migrations` create `draft_board_state` and the user-scoped `drafts` history table. Each board is keyed as `<league-id>:<resolved-user-id>`; each saved draft is keyed as `<draft-id>:<resolved-user-id>`. The permissive anonymous policies are intended only for this local Docker development stack.

Pick windows read league size and draft slot from the generated `src/data/draft-config.json` file. It is refreshed automatically from Sleeper before local development and production builds; restart the dev server after Sleeper assigns or changes the draft order.

Use `npm run supabase:migrate` to apply new migrations without clearing saved state. `npm run supabase:reset` rebuilds the local database and deletes local data; `npm run supabase:stop` stops its containers.
