# Draft coach

The coach is an OpenAI-powered reviewer that runs in a local Supabase Edge Function so the API key never enters the browser bundle.

## Running it

Add `OPENAI_API_KEY` to your environment file, then use two terminals. The coach command automatically selects `.env.local` when present and otherwise uses `.env`:

```bash
npm run coach:serve
npm run dev
```

`OPENAI_COACH_MODEL` (default `gpt-5.6`) selects the model.

The coach function only accepts browser requests from `localhost`/`127.0.0.1` origins, so other websites open in your browser cannot spend your OpenAI key while the stack is running. Set `COACH_ALLOWED_ORIGINS` (comma-separated) in your environment file if you serve the app from a different origin.

## Using it

Use **Coach** from draft history for an eight-draft review, or **Coach this draft** for a session scoped to one draft.

In a draft-scoped session, the **Grade my draft** preset asks for a 0–100 score with a pick-by-pick review. The coach has a playback tool that reconstructs the exact available-player pool at any pick, and it sees your full pre-draft board — personal ranks, overall and position tiers, tags, and player notes — so grades are judged against your own valuations, not just market ADP. Use the copy button in the chat header to copy the whole conversation to the clipboard.

The coach is preconfigured with the league settings: 0.5 PPR with a 1 QB / 2 RB / 2 WR / 1 TE / 1 FLEX / 1 K / 1 DST starting lineup.

## Knowledge base

Drop markdown files into the `coach-notes/` directory to build the coach's knowledge base — strategy, league tendencies, player takes. Every note is sent with each coaching request (see `coach-notes/README.md`). Coach notes are private intelligence and stay out of public copies of this repository, so they stay on your machine.

## Memory

Use the bookmark button beside any coach chat message to save it to coach memory. Memories are stored in the local Supabase `coach_memories` table and replayed to the coach with every future request, so kept insights persist across sessions. Requires the `coach_memories` migration (`npm run supabase:migrate`).
