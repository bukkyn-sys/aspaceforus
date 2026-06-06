-- ════════════════════════════════════════════════════════════════════════════
-- Vault to-dos — "pin a list to Home".
--
-- A couple can mark ONE to-do list as their priority; it surfaces on the Home
-- dashboard (open items, checkable in place). Stored as a pointer on couples so
-- there's exactly one. get_home_data returns the pinned list + its open items.
--
-- Idempotent. Run after vault_todos.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table couples
  add column if not exists priority_todo_list_id uuid references vault_todo_lists(id) on delete set null;

create or replace function set_priority_todo_list(p_couple_id uuid, p_list_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  update couples set priority_todo_list_id = p_list_id where id = p_couple_id;
end; $$;

-- ── get_home_data — re-defined to embed the pinned to-do list ────────────────
-- Same as the calendar_hourly_p2 version plus `priority_todo`.
create or replace function get_home_data(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_couple    uuid;
  v_partner   uuid;
  v_today     date := current_date;
  v_day_key   date := (current_timestamp - interval '4 hours')::date;
  v_me        json;
  v_partner_j json;
  v_couple_j  json;
  v_countdowns json;
  v_events    json;
  v_free      json;
  v_balance   numeric;
  v_pots      json;
  v_action    json;
  v_daily     jsonb;
  v_priority_list uuid;
  v_priority  json;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'forbidden'; end if;

  select couple_id into v_couple from profiles where id = p_user_id;
  if v_couple is null then return json_build_object('me', null, 'partner', null, 'couple', null); end if;

  select id into v_partner from profiles where couple_id = v_couple and id <> p_user_id limit 1;

  select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
    into v_me from profiles where id = p_user_id;
  if v_partner is not null then
    select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
      into v_partner_j from profiles where id = v_partner;
  end if;

  select json_build_object('shared_note', shared_note, 'started_at', started_at, 'invite_code', invite_code,
    'banner_url', banner_url, 'banner_focus', banner_focus, 'currency', coalesce(currency, '£'))
    into v_couple_j from couples where id = v_couple;

  select coalesce(json_agg(row_to_json(c) order by c.target_date), '[]'::json) into v_countdowns
  from (select id, title, target_date, end_date, emoji, created_by from countdowns
        where couple_id = v_couple and archived = false and target_date >= v_today) c;

  select coalesce(json_agg(row_to_json(e) order by e.start_at), '[]'::json) into v_events
  from (select id, title, start_at, end_at, emoji, created_by from events
        where couple_id = v_couple and start_at >= v_today and start_at < v_today + interval '30 days') e;

  select coalesce(json_agg(json_build_object('date', t.d, 'part', t.prt) order by t.d, t.ord), '[]'::json) into v_free
  from (
    select a.date as d, a.part as prt,
           case a.part when 'morning' then 1 when 'afternoon' then 2 when 'evening' then 3 else 4 end as ord
    from availability a
    where a.couple_id = v_couple and a.date >= v_today and a.date <= v_today + 60
    group by a.date, a.part
    having count(distinct a.user_id) = 2
    order by a.date, case a.part when 'morning' then 1 when 'afternoon' then 2 when 'evening' then 3 else 4 end
    limit 3
  ) t;

  select coalesce(sum(case when paid_by = p_user_id then amount * (1 - coalesce(split_ratio, 0.5))
         else - (amount * coalesce(split_ratio, 0.5)) end), 0) into v_balance
  from ledger_entries where couple_id = v_couple and settled = false;

  select coalesce(json_agg(json_build_object('id', id, 'title', title,
    'saved', coalesce(his_amount, 0) + coalesce(hers_amount, 0), 'goal', goal_amount,
    'currency', coalesce(currency, '£'),
    'progress', case when goal_amount > 0
      then least(100, round(((coalesce(his_amount, 0) + coalesce(hers_amount, 0)) / goal_amount) * 100)) else 0 end
  ) order by created_at desc), '[]'::json) into v_pots
  from savings_pots where couple_id = v_couple;

  if v_partner is not null then
    select row_to_json(x) into v_action from (
      select text, at from (
        (select e.created_at as at, 'added to the calendar'::text as text from events e
           where e.couple_id = v_couple and e.created_by = v_partner order by e.created_at desc limit 1)
        union all
        (select a.created_at, 'updated their calendar'::text from availability a
           where a.couple_id = v_couple and a.user_id = v_partner order by a.created_at desc limit 1)
        union all
        (select vi.created_at, (case when vi.type = 'wishlist' then 'added to the wishlist' else 'added to date ideas' end)::text
           from vault_items vi where vi.couple_id = v_couple and vi.created_by = v_partner order by vi.created_at desc limit 1)
        union all
        (select le.created_at, 'logged an expense'::text from ledger_entries le
           where le.couple_id = v_couple and le.paid_by = v_partner order by le.created_at desc limit 1)
        union all
        (select p.mood_updated_at, 'updated their mood'::text from profiles p
           where p.id = v_partner and p.mood_updated_at is not null)
      ) cand where at is not null order by at desc limit 1
    ) x;
  end if;

  v_daily := daily_build(v_couple, v_partner, p_user_id, v_day_key);

  -- Pinned ("priority") to-do list + its open items (checkable on Home).
  select priority_todo_list_id into v_priority_list from couples where id = v_couple;
  if v_priority_list is not null then
    select json_build_object(
      'list_id', tl.id, 'title', tl.title, 'emoji', tl.emoji,
      'remaining', (select count(*) from vault_todos where list_id = tl.id and done = false),
      'items', coalesce((
        select json_agg(json_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date, 'assignee', t.assignee) order by t.created_at)
        from (select id, title, due_date, assignee, created_at from vault_todos
              where list_id = tl.id and done = false order by created_at limit 6) t
      ), '[]'::json)
    ) into v_priority
    from vault_todo_lists tl where tl.id = v_priority_list;
  end if;

  return json_build_object('me', v_me, 'partner', v_partner_j, 'couple', v_couple_j,
    'countdowns', coalesce(v_countdowns, '[]'::json), 'events', coalesce(v_events, '[]'::json),
    'free_days', coalesce(v_free, '[]'::json), 'balance', coalesce(v_balance, 0),
    'pots', coalesce(v_pots, '[]'::json), 'partner_action', v_action, 'daily', v_daily,
    'priority_todo', v_priority);
end; $$;
