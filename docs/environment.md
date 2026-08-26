# Environment variables

Application configuration belongs in `.env` (or an overriding `.env.local`); rankings do not. Rankings are selected interactively in the browser.

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Required for Supabase persistence | Local API URL printed by `npm run supabase:status`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Required for Supabase persistence | Preferred browser-safe Supabase publishable key. |
| `VITE_SUPABASE_ANON_KEY` | Optional legacy fallback | Older browser-safe anon key; used only when the publishable variable is empty. |
| `VITE_SLEEPER_LEAGUE_ID` | Optional | Scopes board state to a Sleeper league and enables league draft imports when paired with a username. |
| `VITE_SLEEPER_USERNAME` | Optional | Resolved through Sleeper's public API to a stable user ID; required for user-scoped draft history. |
| `VITE_DRAFT_LEAGUE_SIZE` | Optional; default `12` | Team count used for snake-pick windows and round/pick labels. |
| `VITE_DRAFT_SLOT` | Optional; default `1` | Your draft position, clamped to the configured league size. |
| `OPENAI_API_KEY` | Optional; coach only | Server-only key read by the local coach Edge Function. Never add a `VITE_` prefix. |
| `OPENAI_COACH_MODEL` | Optional; default `gpt-5.6` | Model used by the local coach Edge Function. |
| `COACH_ALLOWED_ORIGINS` | Optional; coach only | Comma-separated browser origins allowed to call the coach function, replacing the localhost default. |

If the two Supabase browser variables are missing or Supabase is temporarily unavailable, board edits fall back to browser local storage. Supabase remains the authoritative store when it is configured and reachable.

## Validation

`npm run env:validate` loads `.env`, overlays `.env.local`, and then applies relevant process environment variables. It reports:

- Enabled and disabled features, including Supabase persistence, league scoping, draft history, mock imports, and the coach
- Effective league size, draft slot, and coach model
- Incomplete Supabase variable pairs and malformed URLs or draft numbers
- Accidental use of a Supabase secret or `service_role` key in browser configuration
- Optional combinations that are valid but leave related features disabled

The command exits nonzero for configuration errors. Missing optional groups are reported as disabled without failing. It never prints key values.
