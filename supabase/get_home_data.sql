-- ════════════════════════════════════════════════════════════════════════════
-- Task 3 — collapse the Home screen's ~11 parallel queries into one RPC.
--
-- Returns a single JSON object: my profile (mood), partner profile (mood),
-- couple (note/started/invite/banner/currency), upcoming countdowns (not
-- archived), events (next 30 days), free-together days (next 60 days, first 3),
-- ledger balance, savings pots with progress, and most-recent partner activity.
--
-- SECURITY DEFINER, guarded on auth.uid() = p_user_id, pinned search_path.
-- Balance maths replicate the existing client logic exactly (no behaviour change).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function get_home_data(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_couple    uuid;
  v_partner   uuid;
  v_today     date := current_date;
  v_me        json;
  v_partner_j json;
  v_couple_j  json;
  v_countdowns json;
  v_events    json;
  v_free      json;
  v_balance   numeric;
  v_pots      json;
  v_action    json;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  select couple_id into v_couple from profiles where id = p_user_id;
  if v_couple is null then
    return json_build_object('me', null, 'partner', null, 'couple', null);
  end if;

  select id into v_partner from profiles where couple_id = v_couple and id <> p_user_id limit 1;

  -- Profiles (mood)
  select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
    into v_me from profiles where id = p_user_id;

  if v_partner is not null then
    select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
      into v_partner_j from profiles where id = v_partner;
  end if;

  -- Couple
  select json_build_object(
    'shared_note', shared_note, 'started_at', started_at, 'invite_code', invite_code,
    'banner_url', banner_url, 'banner_focus', banner_focus, 'currency', coalesce(currency, '£')
  ) into v_couple_j from couples where id = v_couple;

  -- Upcoming countdowns (not archived), starting today or later
  select coalesce(json_agg(row_to_json(c) order by c.target_date), '[]'::json) into v_countdowns
  from (
    select id, title, target_date, end_date, emoji, created_by
    from countdowns
    where couple_id = v_couple and archived = false and target_date >= v_today
  ) c;

  -- Events in the next 30 days
  select coalesce(json_agg(row_to_json(e) order by e.start_at), '[]'::json) into v_events
  from (
    select id, title, start_at, end_at, emoji, created_by
    from events
    where couple_id = v_couple and start_at >= v_today and start_at < v_today + interval '30 days'
  ) e;

  -- First 3 free-together days in the next 60 days (both members marked 'free')
  select coalesce(json_agg(d order by d), '[]'::json) into v_free
  from (
    select a.date as d
    from availability a
    where a.couple_id = v_couple and a.status = 'free'
      and a.date >= v_today and a.date <= v_today + 60
    group by a.date
    having count(distinct a.user_id) = 2
    order by a.date
    limit 3
  ) t;

  -- Net unsettled balance (+ = partner owes you). Mirrors the client maths:
  -- you paid -> partner owes their share (1-ratio); partner paid -> you owe ratio.
  select coalesce(sum(
    case when paid_by = p_user_id then amount * (1 - coalesce(split_ratio, 0.5))
         else - (amount * coalesce(split_ratio, 0.5)) end
  ), 0) into v_balance
  from ledger_entries where couple_id = v_couple and settled = false;

  -- Savings pots with progress
  select coalesce(json_agg(json_build_object(
    'id', id, 'title', title,
    'saved', coalesce(his_amount, 0) + coalesce(hers_amount, 0),
    'goal', goal_amount,
    'currency', coalesce(currency, '£'),
    'progress', case when goal_amount > 0
      then least(100, round(((coalesce(his_amount, 0) + coalesce(hers_amount, 0)) / goal_amount) * 100))
      else 0 end
  ) order by created_at desc), '[]'::json) into v_pots
  from savings_pots where couple_id = v_couple;

  -- Most recent partner activity across calendar / availability / vault / ledger / mood
  if v_partner is not null then
    select row_to_json(x) into v_action from (
      select text, at from (
        (select e.created_at as at, 'added to the calendar'::text as text
           from events e where e.couple_id = v_couple and e.created_by = v_partner
           order by e.created_at desc limit 1)
        union all
        (select a.created_at, 'updated their calendar'::text
           from availability a where a.couple_id = v_couple and a.user_id = v_partner and a.status is not null
           order by a.created_at desc limit 1)
        union all
        (select vi.created_at,
            (case when vi.type = 'wishlist' then 'added to the wishlist' else 'added to date ideas' end)::text
           from vault_items vi where vi.couple_id = v_couple and vi.created_by = v_partner
           order by vi.created_at desc limit 1)
        union all
        (select le.created_at, 'logged an expense'::text
           from ledger_entries le where le.couple_id = v_couple and le.paid_by = v_partner
           order by le.created_at desc limit 1)
        union all
        (select p.mood_updated_at, 'updated their mood'::text
           from profiles p where p.id = v_partner and p.mood_updated_at is not null)
      ) cand
      where at is not null
      order by at desc
      limit 1
    ) x;
  end if;

  return json_build_object(
    'me', v_me,
    'partner', v_partner_j,
    'couple', v_couple_j,
    'countdowns', coalesce(v_countdowns, '[]'::json),
    'events', coalesce(v_events, '[]'::json),
    'free_days', coalesce(v_free, '[]'::json),
    'balance', coalesce(v_balance, 0),
    'pots', coalesce(v_pots, '[]'::json),
    'partner_action', v_action
  );
end; $$;
