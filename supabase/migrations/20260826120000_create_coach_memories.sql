create table public.coach_memories (
  id uuid primary key default gen_random_uuid(),
  sleeper_user_id text not null,
  content text not null,
  role text not null default 'assistant' check (role in ('user', 'assistant')),
  scope text not null default 'draft' check (scope in ('history', 'draft')),
  draft_id text,
  draft_name text,
  created_at timestamptz not null default now(),
  constraint coach_memories_content_not_blank check (length(trim(content)) > 0)
);

create index coach_memories_user_created_idx
  on public.coach_memories (sleeper_user_id, created_at desc);

comment on table public.coach_memories is
  'Coach chat messages the user chose to keep; replayed into every coaching request as long-term memory.';

alter table public.coach_memories enable row level security;

create policy "local anon can manage coach memories"
on public.coach_memories
for all
to anon
using (true)
with check (true);

grant select, insert, update, delete on table public.coach_memories to anon;
