create table public.drafts (
  id text primary key,
  draft_id text not null,
  sleeper_user_id text not null,
  league_id text,
  season integer not null,
  name text not null,
  status text not null,
  draft_type text not null,
  teams integer not null check (teams > 0),
  rounds integer not null check (rounds > 0),
  draft_slot integer,
  participants jsonb not null default '{}'::jsonb,
  picks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (draft_id, sleeper_user_id),
  constraint drafts_participants_object check (jsonb_typeof(participants) = 'object'),
  constraint drafts_picks_array check (jsonb_typeof(picks) = 'array'),
  constraint drafts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index drafts_user_synced_idx
  on public.drafts (sleeper_user_id, synced_at desc);

comment on table public.drafts is
  'User-scoped Sleeper draft history persisted by the local draft companion.';

alter table public.drafts enable row level security;

create policy "local anon can manage draft history"
on public.drafts
for all
to anon
using (true)
with check (true);

grant select, insert, update, delete on table public.drafts to anon;
