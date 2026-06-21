-- ════════════════════════════════════════════════════════════════════════════
-- Join requests — confirmation step before someone joins a space.
--
-- Previously an 8-digit code joined a space instantly. Now entering the code
-- creates a PENDING request; the existing member sees "X wants to join your
-- space — accept?" and approves (or declines) before the joiner is linked.
--
-- Flow:
--   joiner  → request_join_couple(code)  → row in join_requests (pending)
--   member  → respond_join_request(id, accept) → links joiner + grants trial
--   joiner  → polls / subscribes to their own row → proceeds once accepted
--
-- Reuses join_attempts (join_rate_limit.sql) for brute-force protection and
-- replicates the 30-day trial grant from monetization_phase1.sql on accept.
--
-- Idempotent. Run AFTER join_rate_limit.sql and monetization_phase1.sql.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists join_requests (
  id            uuid        primary key default gen_random_uuid(),
  couple_id     uuid        not null references couples(id)  on delete cascade,
  requester_id  uuid        not null references profiles(id) on delete cascade,
  status        text        not null default 'pending'
                            check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create index if not exists join_requests_couple_idx on join_requests (couple_id, status);
-- At most one live request per person waiting to join.
create unique index if not exists join_requests_one_pending
  on join_requests (requester_id) where status = 'pending';

alter table join_requests enable row level security;
-- The requester sees their own row; the couple's existing member sees requests
-- aimed at their space. Writes go through the SECURITY DEFINER RPCs below.
drop policy if exists join_requests_select on join_requests;
create policy join_requests_select on join_requests for select to authenticated
  using (requester_id = auth.uid() or is_couple_member(couple_id));

-- Realtime so both sides react without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'join_requests'
  ) then
    alter publication supabase_realtime add table public.join_requests;
  end if;
end $$;

-- ── Joiner: create a pending request (validates the code, same as join) ───────
-- Returns { status, couple_id }. couple_id is only set on 'pending' so the
-- server action can push "X wants to join" to the existing member.
create or replace function request_join_couple(p_user_id uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_couple_id uuid;
  v_count     int;
  v_attempts  int;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;

  -- Rate-limit failed code guesses (shared with join_couple_for_user).
  select count(*) into v_attempts from join_attempts
    where user_id = p_user_id and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then return json_build_object('status', 'rate_limited'); end if;

  select id into v_couple_id from couples where invite_code = p_code;
  if not found then
    insert into join_attempts (user_id) values (p_user_id);
    return json_build_object('status', 'not_found');
  end if;

  -- Already in this space → nothing to confirm.
  if exists (select 1 from profiles where id = p_user_id and couple_id = v_couple_id) then
    return json_build_object('status', 'already_member');
  end if;

  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then return json_build_object('status', 'full'); end if;

  -- Replace any stale pending request from this person, then create a fresh one.
  update join_requests set status = 'cancelled', responded_at = now()
    where requester_id = p_user_id and status = 'pending';
  insert into join_requests (couple_id, requester_id) values (v_couple_id, p_user_id);
  return json_build_object('status', 'pending', 'couple_id', v_couple_id);
end; $$;

-- ── Member: accept or decline a pending request ───────────────────────────────
create or replace function respond_join_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id   uuid;
  v_requester   uuid;
  v_status      text;
  v_count       int;
begin
  select couple_id, requester_id, status into v_couple_id, v_requester, v_status
    from join_requests where id = p_request_id;
  if not found then return 'gone'; end if;
  -- Only an existing member of the target space may respond.
  if not is_couple_member(v_couple_id) then raise exception 'forbidden'; end if;
  if v_status <> 'pending' then return 'gone'; end if;

  if not p_accept then
    update join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return 'rejected';
  end if;

  -- Accept: re-check capacity + that the joiner is still free to join.
  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then
    update join_requests set status = 'rejected', responded_at = now() where id = p_request_id;
    return 'full';
  end if;
  if exists (select 1 from profiles where id = v_requester and couple_id is not null) then
    update join_requests set status = 'cancelled', responded_at = now() where id = p_request_id;
    return 'gone';
  end if;

  update profiles set couple_id = v_couple_id where id = v_requester;
  update join_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  -- Any other pending requests to this (now full) space are moot.
  update join_requests set status = 'cancelled', responded_at = now()
    where couple_id = v_couple_id and status = 'pending';

  -- ── Premium trial grant (mirrors join_couple_for_user) ──────────────────────
  if (select trial_ends_at from couples where id = v_couple_id) is null then
    if not exists (
      select 1 from profiles where couple_id = v_couple_id and trial_consumed_at is not null
    ) then
      update couples set paired_at = coalesce(paired_at, now()),
                         trial_ends_at = now() + interval '30 days'
        where id = v_couple_id;
      update profiles set trial_consumed_at = now()
        where couple_id = v_couple_id and trial_consumed_at is null;
    else
      update couples set paired_at = coalesce(paired_at, now()) where id = v_couple_id;
    end if;
  end if;

  return 'accepted';
end; $$;

-- ── Member: the oldest pending request to their space (with who's asking) ─────
create or replace function pending_join_request(p_couple_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_row json;
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  select json_build_object(
    'id', jr.id, 'requester_id', jr.requester_id,
    'name', p.display_name, 'avatar_url', p.avatar_url,
    'accent_color', p.accent_color, 'created_at', jr.created_at
  ) into v_row
  from join_requests jr join profiles p on p.id = jr.requester_id
  where jr.couple_id = p_couple_id and jr.status = 'pending'
  order by jr.created_at asc limit 1;
  return v_row;
end; $$;
