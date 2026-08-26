# Draft History, Replay, and Coach Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Persist Sleeper mock drafts, browse and replay them on dedicated pages, and chat with an OpenAI Agents SDK fantasy coach scoped to either the latest eight drafts or one selected draft.

**Architecture:** Store one user-scoped row per Sleeper draft in local Supabase, including metadata, participants, and the ordered pick payload. Derive replay availability from the pick cutoff instead of storing a snapshot per pick. Run the code-defined coach in a Supabase Edge Function so `OPENAI_API_KEY` never enters the Vite bundle; the client supplies only the selected persisted draft context and chat history.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, Supabase Postgres and Edge Functions, Sleeper public API, `@openai/agents`.

---

### Task 1: User-scoped draft persistence

**Files:**
- Create: `supabase/migrations/20260826010000_create_draft_history.sql`
- Create: `src/lib/draftStore.ts`
- Create: `src/lib/draftStore.test.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/supabase.ts`

1. Write failing tests for row mapping, ordered history, user scoping, and idempotent upserts.
2. Run `npm test -- --run src/lib/draftStore.test.ts` and confirm the missing-module failure.
3. Add the `drafts` table and implement the configured Supabase draft store.
4. Run the targeted tests and confirm they pass.
5. Commit and fast-forward local `main`.

### Task 2: Sleeper import and automatic live-draft saves

**Files:**
- Modify: `src/lib/sleeper.ts`
- Modify: `src/lib/sleeper.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

1. Write failing tests for listing a user's season drafts and saving a successfully synced live draft.
2. Run the targeted tests and confirm expected failures.
3. Implement Sleeper draft listing/detail helpers and persist every successful sync.
4. Run the targeted and full suites.
5. Commit and fast-forward local `main`.

### Task 3: Top-level draft history page

**Files:**
- Create: `src/components/DraftsPage.tsx`
- Create: `src/components/DraftsPage.test.tsx`
- Create: `src/lib/navigation.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

1. Write a failing page test for Board/Drafts navigation, recent-first history, and automatic Sleeper import.
2. Verify the failure, then implement pathname-based top-level navigation and draft cards.
3. Verify targeted and full tests.
4. Commit and fast-forward local `main`.

### Task 4: Draft visualization and replay

**Files:**
- Create: `src/components/DraftDetailPage.tsx`
- Create: `src/components/DraftDetailPage.test.tsx`
- Create: `src/lib/draftReplay.ts`
- Create: `src/lib/draftReplay.test.ts`
- Modify: `src/styles.css`

1. Write failing tests for a 12-column round board and a replay cutoff at `4.11`.
2. Verify the failure, then implement pick selection, **Jump back**, future-pick masking, and available/unavailable lists.
3. Verify targeted and full tests.
4. Commit and fast-forward local `main`.

### Task 5: Scoped fantasy coach

**Files:**
- Create: `src/components/CoachPanel.tsx`
- Create: `src/components/CoachPanel.test.tsx`
- Create: `src/lib/coach.ts`
- Create: `src/lib/coach.test.ts`
- Create: `supabase/functions/coach/index.ts`
- Modify: `supabase/config.toml`
- Modify: `.env.example`
- Modify: `src/components/DraftsPage.tsx`
- Modify: `src/components/DraftDetailPage.tsx`

1. Write failing tests proving history scope is capped at eight drafts and detail scope sends exactly one.
2. Verify the failures, then add the coach drawer and client.
3. Add the Edge Function using `Agent` and `run` from `@openai/agents`; read `OPENAI_API_KEY` only in the function.
4. Add `OPENAI_API_KEY` and optional `OPENAI_COACH_MODEL` to `.env.example` without a `VITE_` prefix.
5. Verify unit tests, TypeScript build, and local function configuration.
6. Commit and fast-forward local `main`.

### Task 6: Documentation and completion verification

**Files:**
- Modify: `README.md`

1. Document import, replay, coach scopes, and local Edge Function secrets.
2. Run `npm test`, `npm run build`, and `git diff --check` fresh.
3. Attempt the in-app browser workflow; report plainly if no browser backend is connected.
4. Commit documentation and fast-forward local `main`.
