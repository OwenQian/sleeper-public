# Supabase setup in detail

This repository already contains `supabase/config.toml`, SQL migrations, and the Supabase CLI as a development dependency. You do not need to run `supabase init`.

1. Install dependencies with `npm install`. The project-local CLI is then available through the npm scripts.
2. Start Docker Desktop (or an equivalent Docker-compatible runtime).
3. Create your private environment file with `cp .env.example .env`. Both `.env` and `.env.local` are ignored by Git; when both exist, `.env.local` takes precedence.
4. Run `npm run supabase:start` from the repository root. The first start downloads the local services and applies the tracked migrations.
5. Run `npm run supabase:status` whenever you need to see the local service URLs and keys again.
6. Copy the API URL to `VITE_SUPABASE_URL`. For this repository's default ports it is `http://127.0.0.1:54321`.
7. Copy the **Publishable** key (`sb_publishable_...`) to `VITE_SUPABASE_PUBLISHABLE_KEY`. Older CLI versions may print an `anon` JWT instead; place that in `VITE_SUPABASE_ANON_KEY` only when no publishable key is available.
8. Never put a **Secret** (`sb_secret_...`) or legacy `service_role` key in a `VITE_` variable. Vite embeds those values in browser JavaScript. Secret and service-role keys bypass Row Level Security and belong only in trusted backend services. See Supabase's [API key guide](https://supabase.com/docs/guides/getting-started/api-keys).
9. Run `npm run env:validate`. Fix anything listed under **Errors**; optional features listed as disabled do not make validation fail.
10. Run `npm run supabase:migrate`. This applies migrations that have not already run and preserves existing rows.
11. Run `npm run dev`, import a CSV, and open Supabase Studio at `http://127.0.0.1:54323`. The imported board will appear in `draft_board_state`; synced drafts appear in `drafts`.

The official [Supabase local CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started) describes the Docker requirement, local services, and generated credentials.

## Lifecycle commands

```bash
npm run supabase:status  # Show local URLs and browser/server keys
npm run env:validate     # Validate values and show enabled/disabled features
npm run supabase:migrate # Apply pending migrations without deleting data
npm run supabase:stop    # Stop containers and preserve local data
npm run supabase:reset   # Rebuild the database and DELETE local rows
```

## Local-only security model

The checked-in migrations enable Row Level Security, but intentionally grant the anonymous role full access to the app tables for single-user local development. Do not point this public frontend at a hosted Supabase project with these policies unchanged: anyone with the public project URL and publishable key could access every board and draft row allowed by those policies.

Before a hosted deployment, add Supabase Auth and replace the local anonymous policies with user-owned row policies. Supabase explains why frontend publishable keys must be paired with least-privilege RLS in [Securing your data](https://supabase.com/docs/guides/database/secure-data).

## Persistence model

The migrations in `supabase/migrations` create:

- `draft_board_state`, containing the parsed board snapshot
- `drafts`, containing user-scoped Sleeper draft history
- `coach_memories`, containing coach chat messages saved to memory

Boards are keyed as `<league-id>:<resolved-user-id>` when Sleeper identity variables are set, `<league-id>:anonymous` with only a league ID, or `default` with neither. Saved drafts require `VITE_SLEEPER_USERNAME` and are keyed as `<draft-id>:<resolved-user-id>`.

Once initialized, persisted board state is loaded verbatim. The app never rereads or merges a repository data file because no such runtime file exists.
