create table public.draft_board_state (
  id text primary key,
  league_id text,
  sleeper_user_id text,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  constraint draft_board_state_json_object check (jsonb_typeof(state) = 'object')
);

comment on table public.draft_board_state is
  'Local-only draft companion state. The anon policy is intentionally permissive for Docker development.';

alter table public.draft_board_state enable row level security;

create policy "local anon can manage draft boards"
on public.draft_board_state
for all
to anon
using (true)
with check (true);

grant select, insert, update, delete on table public.draft_board_state to anon;
