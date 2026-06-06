-- ════════════════════════════════════════════════════════════════════════════
-- Vault overhaul — To-dos.
--
-- Shared, couple-editable to-do lists. Either partner can add, tick, edit, or
-- delete any item (RLS is couple-scoped); attribution is kept via created_by and
-- done_by. The advanced columns (parent_id, recurrence, remind) are created now
-- so Phase 3 (subtasks / recurring / reminders) needs no further migration.
--
-- Idempotent / re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists vault_todo_lists (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  title       text not null,
  emoji       text not null default '✅',
  sort_order  int not null default 0,
  created_at  timestamptz default now()
);

create table if not exists vault_todos (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references vault_todo_lists(id) on delete cascade,
  couple_id   uuid not null references couples(id) on delete cascade,
  created_by  uuid not null references profiles(id),
  parent_id   uuid references vault_todos(id) on delete cascade,        -- subtask (Phase 3)
  title       text not null,
  notes       text,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references profiles(id),
  due_date    date,
  assignee    text,                                                     -- user-id | 'both' | null
  position    double precision not null default 0,                      -- drag-reorder (Phase 3)
  recurrence  text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')), -- Phase 3
  remind      boolean not null default false,                           -- Phase 3
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists vault_todos_list_idx   on vault_todos (list_id);
create index if not exists vault_todos_couple_idx on vault_todos (couple_id);

alter table vault_todo_lists enable row level security;
alter table vault_todos      enable row level security;

drop policy if exists vault_todo_lists_all on vault_todo_lists;
create policy vault_todo_lists_all on vault_todo_lists for all using (is_couple_member(couple_id));

drop policy if exists vault_todos_all on vault_todos;
create policy vault_todos_all on vault_todos for all using (is_couple_member(couple_id));
