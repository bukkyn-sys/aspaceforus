-- ════════════════════════════════════════════════════════════════════════════
-- Calendar feed — a per-couple subscribable .ics URL (one-way: us. → Apple /
-- Google / Outlook). The feed is served by /api/calendar/<token> using the
-- service role (the calendar app fetches it with no login), so the token IS the
-- secret/capability — it must stay unguessable and be regeneratable.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

alter table couples add column if not exists calendar_token uuid not null default gen_random_uuid();
create unique index if not exists couples_calendar_token_idx on couples (calendar_token);

-- Return the caller's couple feed token (used to build the subscribe URL).
create or replace function get_calendar_token()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_couple uuid; v_token uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = auth.uid();
  if v_couple is null then raise exception 'no_couple'; end if;
  select calendar_token into v_token from couples where id = v_couple;
  return v_token;
end; $$;

-- Roll the token (invalidates the old subscribe URL).
create or replace function regenerate_calendar_token()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_couple uuid; v_token uuid;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = auth.uid();
  if v_couple is null then raise exception 'no_couple'; end if;
  update couples set calendar_token = gen_random_uuid() where id = v_couple
    returning calendar_token into v_token;
  return v_token;
end; $$;

revoke execute on function get_calendar_token()        from anon;
revoke execute on function regenerate_calendar_token() from anon;
