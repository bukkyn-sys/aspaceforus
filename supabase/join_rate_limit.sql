-- ════════════════════════════════════════════════════════════════════════════
-- Rate-limit join attempts: max 10 failed code guesses per user per 15 min.
--
-- The invite code is 8 hex chars (~4 billion possibilities). At 10 attempts
-- per 15 minutes an attacker would need ~800 million years to brute-force a
-- specific couple. This table is tiny — only failed attempts are recorded.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists join_attempts (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_time on join_attempts (user_id, attempted_at);

alter table join_attempts enable row level security;
-- Users can only see/delete their own rows (needed for cleanup); inserts are
-- done by the security-definer RPC so no INSERT policy is needed here.
create policy "own rows" on join_attempts for select to authenticated
  using (user_id = auth.uid());

-- Re-create join_couple_for_user with rate limiting.
create or replace function join_couple_for_user(p_user_id uuid, p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id  uuid;
  v_count      int;
  v_attempts   int;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;

  -- Rate-limit: count failed attempts in the last 15 minutes.
  select count(*) into v_attempts
    from join_attempts
    where user_id = p_user_id
      and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then
    return 'rate_limited';
  end if;

  select id into v_couple_id from couples where invite_code = p_code;
  if not found then
    -- Record the failed attempt.
    insert into join_attempts (user_id) values (p_user_id);
    return 'not_found';
  end if;

  -- Already a member of this space → idempotent success (don't count as attempt).
  if exists (select 1 from profiles where id = p_user_id and couple_id = v_couple_id) then
    return 'ok';
  end if;

  -- Couple full?
  select count(*) into v_count from profiles where couple_id = v_couple_id;
  if v_count >= 2 then return 'full'; end if;

  update profiles set couple_id = v_couple_id where id = p_user_id;
  return 'ok';
end; $$;
