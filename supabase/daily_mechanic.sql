-- ════════════════════════════════════════════════════════════════════════════
-- "the daily" — one shared daily moment between the two partners.
--
-- One short prompt surfaces per couple per day on Home. You answer; you CANNOT
-- see your partner's answer until you've also answered (simultaneous reveal,
-- gated server-side in the read RPC). Answered days accrete into a permanent,
-- scrollable timeline — the same record that later powers "memories".
--
-- Design invariants enforced here (see build brief):
--   • Cumulative, never a streak. No loss-aversion anywhere.
--   • Reveal gate lives in the read path — the partner answer is never returned
--     to a client that hasn't answered the same moment.
--   • Read path is WRITE-FREE: the daily_moments row is materialised lazily on
--     the first *answer* (inside submit_daily_response), never on page load.
--   • Prompt selection is a pure, deterministic, read-only function of
--     (couple_id, day_key, library, prior-day history) so both partners converge
--     on the same prompt with no write race; once a moment exists its pinned
--     prompt_id wins.
--   • Once both have answered the moment LOCKS (answers immutable) — protects
--     shared memory / on_this_day / future `reprise`.
--   • Partner-change privacy: leave_couple_for_user soft-archives this couple's
--     daily_* so a new partner filling the same slot starts fresh and can never
--     see the previous partner's answers.
--
-- Idempotent / re-runnable. SECURITY DEFINER + pinned search_path throughout.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

-- Seeded content library. NOT couple-scoped; readable by all authenticated
-- users, never client-writable.
create table if not exists daily_prompts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('question', 'this_or_that', 'reflect', 'tied')),
  body            text not null unique,                 -- unique → idempotent re-seed
  options         jsonb,                                -- this_or_that only
  intimacy        int not null default 1 check (intimacy between 1 and 3),
  tags            text[] not null default '{}',
  min_shared_count int not null default 0,              -- gates deeper prompts behind shared history
  weight          int not null default 1,
  active          boolean not null default true,
  created_at      timestamptz default now()
);

-- One row per couple per shared day; pins the active prompt so both partners get
-- the same one. Materialised lazily on the first answer. Every read EVERYWHERE
-- excludes archived_at is not null (partner-change privacy).
create table if not exists daily_moments (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references couples(id) on delete cascade,
  moment_date date not null,                            -- the 4 a.m.-rolled day_key
  prompt_id   uuid not null references daily_prompts(id),
  archived_at timestamptz,
  created_at  timestamptz default now(),
  unique (couple_id, moment_date)
);

-- Each partner's answer to a moment. body always holds the renderable answer text
-- (for this_or_that it equals the chosen option); option_choice keeps the
-- structured choice. RLS makes the partner row readable once it exists — the
-- reveal gate is enforced in the read RPC, and clients never read this directly.
create table if not exists daily_responses (
  id            uuid primary key default gen_random_uuid(),
  moment_id     uuid not null references daily_moments(id) on delete cascade,
  couple_id     uuid not null references couples(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  body          text not null,
  option_choice text,
  created_at    timestamptz default now(),
  unique (moment_id, user_id)
);

create index if not exists daily_moments_couple_date_idx on daily_moments (couple_id, moment_date);
create index if not exists daily_responses_moment_idx     on daily_responses (moment_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table daily_prompts   enable row level security;
alter table daily_moments   enable row level security;
alter table daily_responses enable row level security;

-- Library: read-only to authenticated clients; no write policy → writes denied
-- (seed runs as table owner and bypasses RLS).
drop policy if exists daily_prompts_select on daily_prompts;
create policy daily_prompts_select on daily_prompts for select to authenticated using (true);

-- Moments / responses: couple-scoped. (The app only reads these via the gated
-- RPCs; the policies are defence-in-depth. Archive-exclusion is enforced in the
-- RPCs, not RLS.)
drop policy if exists daily_moments_all on daily_moments;
create policy daily_moments_all on daily_moments for all using (is_couple_member(couple_id));

drop policy if exists daily_responses_all on daily_responses;
create policy daily_responses_all on daily_responses for all using (is_couple_member(couple_id));

-- ── Helper: cumulative shared count (never a streak) ─────────────────────────
-- count(distinct moment_date) over NON-archived moments holding two responses.
create or replace function daily_shared_count(p_couple_id uuid)
returns int language sql security definer set search_path = public stable as $$
  select count(distinct dm.moment_date)::int
  from daily_moments dm
  where dm.couple_id = p_couple_id
    and dm.archived_at is null
    and (select count(distinct r.user_id) from daily_responses r where r.moment_id = dm.id) = 2;
$$;

-- ── Selection: pure, deterministic, read-only prompt pick ────────────────────
-- A function of (couple_id, day_key, active library, prior-day history) only —
-- no writes, excludes PRIOR-day usage only, so it is stable across the whole day
-- and both partners independently converge on the same prompt before any row
-- exists. Weighted-random is made deterministic by seeding on hash(couple||date
-- ||prompt). Never returns null: filters relax in a fixed order until a prompt
-- remains (the ungated intimacy 1/2 starters guarantee a new couple has options).
create or replace function daily_pick_prompt(p_couple_id uuid, p_day_key date)
returns uuid language plpgsql security definer set search_path = public stable as $$
declare
  v_shared          int;
  v_active_eligible int;
  v_cooldown        int;
  v_is_weekend      boolean := extract(dow from p_day_key) in (0, 6);
  v_yest_kind       text;
  v_yest_intimacy   int;
  v_day2_kind       text;
  v_no_deep_today   boolean;   -- yesterday was deep → no deep today
  v_block_kind      text;      -- a kind run 2 days deep → block it today
  v_prompt          uuid;
begin
  v_shared := daily_shared_count(p_couple_id);

  select count(*)::int into v_active_eligible
  from daily_prompts where active and min_shared_count <= v_shared;

  -- Adaptive no-repeat window so a small library never starves.
  v_cooldown := greatest(0, least(90, v_active_eligible - 10));

  -- Prior-day context (non-archived).
  select dp.kind, dp.intimacy into v_yest_kind, v_yest_intimacy
  from daily_moments dm join daily_prompts dp on dp.id = dm.prompt_id
  where dm.couple_id = p_couple_id and dm.archived_at is null and dm.moment_date = p_day_key - 1;

  select dp.kind into v_day2_kind
  from daily_moments dm join daily_prompts dp on dp.id = dm.prompt_id
  where dm.couple_id = p_couple_id and dm.archived_at is null and dm.moment_date = p_day_key - 2;

  v_no_deep_today := coalesce(v_yest_intimacy = 3, false);
  v_block_kind    := case when v_yest_kind is not null and v_yest_kind = v_day2_kind then v_yest_kind else null end;

  -- Attempt 1 — strictest: eligible · not in cooldown · no two deep days running
  -- · same-kind-run cap.
  select p.id into v_prompt from daily_prompts p
  where p.active and p.min_shared_count <= v_shared
    and not exists (select 1 from daily_moments dm where dm.couple_id = p_couple_id and dm.archived_at is null
                      and dm.prompt_id = p.id and dm.moment_date >= p_day_key - v_cooldown and dm.moment_date < p_day_key)
    and not (v_no_deep_today and p.intimacy = 3)
    and (v_block_kind is null or p.kind <> v_block_kind)
  order by power((abs(hashtext(p_couple_id::text || p_day_key::text || p.id::text)) % 100000 + 1)::float8 / 100001.0,
                 1.0 / greatest(p.weight * (case when v_is_weekend and 'weekend' = any(p.tags) then 2 else 1 end), 1)) desc
  limit 1;
  if v_prompt is not null then return v_prompt; end if;

  -- Attempt 2 — drop same-kind-run cap.
  select p.id into v_prompt from daily_prompts p
  where p.active and p.min_shared_count <= v_shared
    and not exists (select 1 from daily_moments dm where dm.couple_id = p_couple_id and dm.archived_at is null
                      and dm.prompt_id = p.id and dm.moment_date >= p_day_key - v_cooldown and dm.moment_date < p_day_key)
    and not (v_no_deep_today and p.intimacy = 3)
  order by power((abs(hashtext(p_couple_id::text || p_day_key::text || p.id::text)) % 100000 + 1)::float8 / 100001.0,
                 1.0 / greatest(p.weight * (case when v_is_weekend and 'weekend' = any(p.tags) then 2 else 1 end), 1)) desc
  limit 1;
  if v_prompt is not null then return v_prompt; end if;

  -- Attempt 3 — drop the no-two-deep rule.
  select p.id into v_prompt from daily_prompts p
  where p.active and p.min_shared_count <= v_shared
    and not exists (select 1 from daily_moments dm where dm.couple_id = p_couple_id and dm.archived_at is null
                      and dm.prompt_id = p.id and dm.moment_date >= p_day_key - v_cooldown and dm.moment_date < p_day_key)
  order by power((abs(hashtext(p_couple_id::text || p_day_key::text || p.id::text)) % 100000 + 1)::float8 / 100001.0,
                 1.0 / greatest(p.weight, 1)) desc
  limit 1;
  if v_prompt is not null then return v_prompt; end if;

  -- Attempt 4 — cooldown becomes least-recently-used (ignore the no-repeat window).
  select p.id into v_prompt from daily_prompts p
  where p.active and p.min_shared_count <= v_shared
  order by (select max(dm.moment_date) from daily_moments dm
              where dm.couple_id = p_couple_id and dm.archived_at is null and dm.prompt_id = p.id and dm.moment_date < p_day_key)
             asc nulls first,
           power((abs(hashtext(p_couple_id::text || p_day_key::text || p.id::text)) % 100000 + 1)::float8 / 100001.0,
                 1.0 / greatest(p.weight, 1)) desc
  limit 1;
  if v_prompt is not null then return v_prompt; end if;

  -- Attempt 5 — last resort: ignore min_shared_count entirely.
  select p.id into v_prompt from daily_prompts p
  where p.active
  order by (select max(dm.moment_date) from daily_moments dm
              where dm.couple_id = p_couple_id and dm.archived_at is null and dm.prompt_id = p.id and dm.moment_date < p_day_key)
             asc nulls first,
           power((abs(hashtext(p_couple_id::text || p_day_key::text || p.id::text)) % 100000 + 1)::float8 / 100001.0,
                 1.0 / greatest(p.weight, 1)) desc
  limit 1;

  return v_prompt;
end; $$;

-- ── Payload builder (shared by get_daily + get_home_data) ────────────────────
-- Returns the full daily payload for a caller, applying the reveal gate. Pure
-- read — performs NO writes (uses the pinned prompt if a moment exists, else the
-- deterministic pick).
create or replace function daily_build(p_couple uuid, p_partner uuid, p_caller uuid, p_day_key date)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_shared       int;
  v_moment_id    uuid;
  v_prompt_id    uuid;
  v_prompt_json  jsonb;
  v_my           text;
  v_partner_ans  text;
  v_both         boolean;
  v_on_this_day  jsonb;
  v_oneyear      date;
begin
  if p_partner is null then
    return jsonb_build_object('paired', false);
  end if;

  v_shared := daily_shared_count(p_couple);

  -- Pinned prompt wins; otherwise the deterministic pick (no write either way).
  select id, prompt_id into v_moment_id, v_prompt_id
  from daily_moments where couple_id = p_couple and moment_date = p_day_key and archived_at is null;
  if v_prompt_id is null then
    v_prompt_id := daily_pick_prompt(p_couple, p_day_key);
  end if;

  select jsonb_build_object('id', id, 'kind', kind, 'body', body, 'options', options,
                            'tags', to_jsonb(tags), 'intimacy', intimacy)
    into v_prompt_json from daily_prompts where id = v_prompt_id;

  if v_moment_id is not null then
    select body into v_my          from daily_responses where moment_id = v_moment_id and user_id = p_caller;
    select body into v_partner_ans from daily_responses where moment_id = v_moment_id and user_id = p_partner;
  end if;

  v_both := v_my is not null and v_partner_ans is not null;

  -- on this day — a non-archived, both-answered moment exactly one year prior
  -- (Postgres clamps Feb 29 → Feb 28 on the year subtraction).
  v_oneyear := (p_day_key - interval '1 year')::date;
  select jsonb_build_object(
           'year', extract(year from od.moment_date)::int,
           'prompt_body', odp.body,
           'my_answer',      (select body from daily_responses r where r.moment_id = od.id and r.user_id = p_caller),
           'partner_answer', (select body from daily_responses r where r.moment_id = od.id and r.user_id = p_partner))
    into v_on_this_day
  from daily_moments od join daily_prompts odp on odp.id = od.prompt_id
  where od.couple_id = p_couple and od.archived_at is null and od.moment_date = v_oneyear
    and (select count(distinct r.user_id) from daily_responses r where r.moment_id = od.id) = 2
  limit 1;

  return jsonb_build_object(
    'paired', true,
    'day_key', p_day_key,
    'moment_id', v_moment_id,
    'prompt', v_prompt_json,
    'my_answer', v_my,
    'partner_answered', v_partner_ans is not null,
    -- REVEAL GATE: partner's answer only once I've answered.
    'partner_answer', case when v_my is not null then v_partner_ans else null end,
    'both_answered', v_both,
    'locked', v_both,
    'shared_count', v_shared,
    'on_this_day', v_on_this_day
  );
end; $$;

-- ── get_daily(day_key) — read-only ───────────────────────────────────────────
create or replace function get_daily(p_day_key date)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_couple  uuid;
  v_partner uuid;
  v_server  date;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = auth.uid();
  if v_couple is null then return jsonb_build_object('paired', false); end if;
  select id into v_partner from profiles where couple_id = v_couple and id <> auth.uid() limit 1;

  -- Clamp to within ±1 of the server's 4 a.m.-rolled date (stable reads; reject
  -- only happens on write). 4 a.m. rollover: subtract 4h before taking the date.
  v_server := (current_timestamp - interval '4 hours')::date;
  if p_day_key is null or p_day_key > v_server + 1 or p_day_key < v_server - 1 then
    p_day_key := v_server;
  end if;

  return daily_build(v_couple, v_partner, auth.uid(), p_day_key);
end; $$;

-- ── submit_daily_response — the only write path ──────────────────────────────
create or replace function submit_daily_response(p_day_key date, p_body text, p_option text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_couple      uuid;
  v_partner     uuid;
  v_server      date;
  v_prompt_id   uuid;
  v_kind        text;
  v_options     jsonb;
  v_moment_id   uuid;
  v_body        text;
  v_me_has      boolean;
  v_partner_has boolean;
  v_is_new      boolean;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = auth.uid();
  if v_couple is null then raise exception 'unpaired'; end if;
  select id into v_partner from profiles where couple_id = v_couple and id <> auth.uid() limit 1;
  if v_partner is null then raise exception 'unpaired'; end if;

  -- Today-only, no backfill: reject a day_key outside ±1 of the server day.
  v_server := (current_timestamp - interval '4 hours')::date;
  if p_day_key is null or p_day_key > v_server + 1 or p_day_key < v_server - 1 then
    raise exception 'invalid_day';
  end if;

  -- Prompt: pinned if the moment exists, else the deterministic server pick
  -- (never client-supplied — no injection vector).
  select prompt_id into v_prompt_id from daily_moments where couple_id = v_couple and moment_date = p_day_key;
  if v_prompt_id is null then
    v_prompt_id := daily_pick_prompt(v_couple, p_day_key);
  end if;

  -- Idempotent get-or-create; the existing row's pinned prompt wins on conflict.
  insert into daily_moments (couple_id, moment_date, prompt_id)
    values (v_couple, p_day_key, v_prompt_id)
    on conflict (couple_id, moment_date) do nothing;
  select id, prompt_id into v_moment_id, v_prompt_id
    from daily_moments where couple_id = v_couple and moment_date = p_day_key;

  select kind, options into v_kind, v_options from daily_prompts where id = v_prompt_id;

  -- Validate the answer (always stored/rendered as text downstream).
  if v_kind = 'this_or_that' then
    if p_option is null or v_options is null or not (v_options ? p_option) then
      raise exception 'invalid_option';
    end if;
    v_body := p_option;
  else
    v_body := btrim(coalesce(p_body, ''));
    if length(v_body) = 0 or length(v_body) > 280 then raise exception 'invalid_body'; end if;
  end if;

  -- Lock: once both have answered the moment is immutable.
  select exists(select 1 from daily_responses where moment_id = v_moment_id and user_id = auth.uid()) into v_me_has;
  select exists(select 1 from daily_responses where moment_id = v_moment_id and user_id = v_partner) into v_partner_has;
  if v_me_has and v_partner_has then raise exception 'locked'; end if;

  v_is_new := not v_me_has;

  insert into daily_responses (moment_id, couple_id, user_id, body, option_choice)
    values (v_moment_id, v_couple, auth.uid(), v_body,
            case when v_kind = 'this_or_that' then p_option else null end)
  on conflict (moment_id, user_id) do update
    set body = excluded.body, option_choice = excluded.option_choice;

  -- Push decision re-reads partner state after commit (double-notify race): only
  -- nudge a genuinely-waiting partner, and only on a first answer (not an edit).
  return daily_build(v_couple, v_partner, auth.uid(), p_day_key)
    || jsonb_build_object(
         'should_notify',  (not v_partner_has) and v_is_new,
         'completed_pair', v_partner_has and v_is_new   -- my answer just completed the pair
       );
end; $$;

-- ── get_daily_history — paginated, newest-first, both-answered, non-archived ──
create or replace function get_daily_history(p_limit int default 20, p_before date default null)
returns json language plpgsql security definer set search_path = public stable as $$
declare
  v_couple  uuid;
  v_partner uuid;
  v_res     json;
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = auth.uid();
  if v_couple is null then return '[]'::json; end if;
  select id into v_partner from profiles where couple_id = v_couple and id <> auth.uid() limit 1;

  select coalesce(json_agg(row_to_json(t) order by t.moment_date desc), '[]'::json) into v_res
  from (
    select dm.moment_date,
           dp.body as prompt_body,
           (select body from daily_responses r where r.moment_id = dm.id and r.user_id = auth.uid()) as my_answer,
           (select body from daily_responses r where r.moment_id = dm.id and r.user_id = v_partner)  as partner_answer
    from daily_moments dm
    join daily_prompts dp on dp.id = dm.prompt_id
    where dm.couple_id = v_couple and dm.archived_at is null
      and (p_before is null or dm.moment_date < p_before)
      and (select count(distinct r.user_id) from daily_responses r where r.moment_id = dm.id) = 2
    order by dm.moment_date desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) t;

  return v_res;
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- get_home_data — re-defined to embed the read-only `daily` payload (no write on
-- the Home path). Identical to get_home_data.sql plus the daily object + day_key.
-- ════════════════════════════════════════════════════════════════════════════
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
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden';
  end if;

  select couple_id into v_couple from profiles where id = p_user_id;
  if v_couple is null then
    return json_build_object('me', null, 'partner', null, 'couple', null);
  end if;

  select id into v_partner from profiles where couple_id = v_couple and id <> p_user_id limit 1;

  select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
    into v_me from profiles where id = p_user_id;

  if v_partner is not null then
    select json_build_object('id', id, 'current_mood', current_mood, 'mood_updated_at', mood_updated_at)
      into v_partner_j from profiles where id = v_partner;
  end if;

  select json_build_object(
    'shared_note', shared_note, 'started_at', started_at, 'invite_code', invite_code,
    'banner_url', banner_url, 'banner_focus', banner_focus, 'currency', coalesce(currency, '£')
  ) into v_couple_j from couples where id = v_couple;

  select coalesce(json_agg(row_to_json(c) order by c.target_date), '[]'::json) into v_countdowns
  from (
    select id, title, target_date, end_date, emoji, created_by
    from countdowns
    where couple_id = v_couple and archived = false and target_date >= v_today
  ) c;

  select coalesce(json_agg(row_to_json(e) order by e.start_at), '[]'::json) into v_events
  from (
    select id, title, start_at, end_at, emoji, created_by
    from events
    where couple_id = v_couple and start_at >= v_today and start_at < v_today + interval '30 days'
  ) e;

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

  select coalesce(sum(
    case when paid_by = p_user_id then amount * (1 - coalesce(split_ratio, 0.5))
         else - (amount * coalesce(split_ratio, 0.5)) end
  ), 0) into v_balance
  from ledger_entries where couple_id = v_couple and settled = false;

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

  -- the daily — read-only payload (write-free; lazily materialised on answer).
  v_daily := daily_build(v_couple, v_partner, p_user_id, v_day_key);

  return json_build_object(
    'me', v_me,
    'partner', v_partner_j,
    'couple', v_couple_j,
    'countdowns', coalesce(v_countdowns, '[]'::json),
    'events', coalesce(v_events, '[]'::json),
    'free_days', coalesce(v_free, '[]'::json),
    'balance', coalesce(v_balance, 0),
    'pots', coalesce(v_pots, '[]'::json),
    'partner_action', v_action,
    'daily', v_daily
  );
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- leave_couple_for_user — re-defined to add the daily archive hook alongside the
-- existing vault/event reassignment. Partner-change privacy: soft-archive this
-- couple's daily_moments so the daily vanishes from every surface and a NEW
-- partner who later fills the same slot starts a fresh history and can never see
-- the previous partner's answers. Soft-archive (never hard-delete) keeps the
-- record intact for future `reprise` / export.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple  uuid;
  v_partner uuid;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;

  select couple_id into v_couple from profiles where id = p_user_id;

  if v_couple is not null then
    select id into v_partner from profiles
      where couple_id = v_couple and id <> p_user_id
      limit 1;

    if v_partner is not null then
      update vault_items set created_by = v_partner
        where couple_id = v_couple and created_by = p_user_id;
      update events set created_by = v_partner
        where couple_id = v_couple and created_by = p_user_id;
      -- ledger_entries: keep created_by (RLS already permits partner edit/delete).
    end if;

    -- the daily is intimate two-person content — archive ALL of this couple's
    -- moments (responses are reachable only via a non-archived moment, so this
    -- hides them everywhere) so the slot's next partner starts fresh.
    update daily_moments set archived_at = now()
      where couple_id = v_couple and archived_at is null;
  end if;

  update profiles set couple_id = null where id = p_user_id;
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Seed — starter prompt set (§10). Idempotent: unique(body) + on conflict do
-- nothing, so re-running never duplicates.
-- ════════════════════════════════════════════════════════════════════════════

-- this_or_that (intimacy 1)
insert into daily_prompts (kind, body, options, intimacy) values
  ('this_or_that', 'lazy morning or early start?',        '["lazy morning","early start"]'::jsonb, 1),
  ('this_or_that', 'beach or mountains?',                 '["beach","mountains"]'::jsonb, 1),
  ('this_or_that', 'night in or night out?',              '["night in","night out"]'::jsonb, 1),
  ('this_or_that', 'call or text?',                       '["call","text"]'::jsonb, 1),
  ('this_or_that', 'sweet or savoury?',                   '["sweet","savoury"]'::jsonb, 1),
  ('this_or_that', 'planner or spontaneous?',             '["planner","spontaneous"]'::jsonb, 1),
  ('this_or_that', 'big party or just us?',               '["big party","just us"]'::jsonb, 1),
  ('this_or_that', 'sunrise or sunset?',                  '["sunrise","sunset"]'::jsonb, 1),
  ('this_or_that', 'coffee or tea?',                      '["coffee","tea"]'::jsonb, 1),
  ('this_or_that', 'city break or countryside?',          '["city break","countryside"]'::jsonb, 1),
  ('this_or_that', 'film at home or cinema?',             '["home","cinema"]'::jsonb, 1),
  ('this_or_that', 'save it or spend it?',                '["save","spend"]'::jsonb, 1),
  ('this_or_that', 'early bird or night owl?',            '["early bird","night owl"]'::jsonb, 1),
  ('this_or_that', 'cook together or order in?',          '["cook","order in"]'::jsonb, 1),
  ('this_or_that', 'road trip or fly?',                   '["road trip","fly"]'::jsonb, 1),
  ('this_or_that', 'summer or winter?',                   '["summer","winter"]'::jsonb, 1),
  ('this_or_that', 'books or podcasts?',                  '["books","podcasts"]'::jsonb, 1),
  ('this_or_that', 'dress up or dress down?',             '["dress up","dress down"]'::jsonb, 1),
  ('this_or_that', 'make plans or wing it this weekend?', '["make plans","wing it"]'::jsonb, 1),
  ('this_or_that', 'breakfast in bed or brunch out?',     '["breakfast in bed","brunch out"]'::jsonb, 1)
on conflict (body) do nothing;

-- question (intimacy 1–2)
insert into daily_prompts (kind, body, intimacy, tags, min_shared_count) values
  ('question', 'what''s one good thing about today?', 1, '{}', 0),
  ('question', 'what made you smile today?', 1, '{}', 0),
  ('question', 'what''s the last thing that made you laugh?', 1, '{}', 0),
  ('question', 'what''s a small thing you''re looking forward to this week?', 1, '{}', 0),
  ('question', 'what''s your mood in one word today?', 1, '{}', 0),
  ('question', 'what song''s been stuck in your head lately?', 1, '{}', 0),
  ('question', 'best meal you''ve had recently?', 1, '{food}', 0),
  ('question', 'what''s the best part of your day usually?', 1, '{}', 0),
  ('question', 'what''s something you want to do together soon?', 2, '{future}', 0),
  ('question', 'if we had a free afternoon tomorrow, what would you want to do?', 2, '{future}', 0),
  ('question', 'what''s a tiny thing i could do this week to make your day easier?', 2, '{}', 0),
  ('question', 'what would your ideal weekend with me look like?', 2, '{weekend,future}', 0),
  ('question', 'what''s something new you''d like us to try together?', 2, '{future}', 0),
  ('question', 'what''s a place near us we keep meaning to go?', 2, '{future}', 0),
  ('question', 'what''s been on your mind today?', 2, '{}', 0),
  ('question', 'what''s something you need more of right now?', 2, '{}', 0),
  ('question', 'what''s a small habit of mine you secretly like?', 2, '{}', 0),
  ('question', 'what''s something you''re proud of yourself for this week?', 2, '{}', 0),
  ('question', 'where in the world do you most want to go with me?', 2, '{future}', 0),
  ('question', 'what do you miss most when we''re apart?', 2, '{distance}', 0),
  ('question', 'what''s the first thing you want to do next time we''re together?', 2, '{distance,future}', 0),
  ('question', 'what''s something you wish we did more often?', 2, '{}', 0),
  ('question', 'what''s something good that happened that i don''t know about yet?', 2, '{}', 0)
on conflict (body) do nothing;

-- reflect (intimacy 3 — gated)
insert into daily_prompts (kind, body, intimacy, tags, min_shared_count) values
  ('reflect', 'what''s one thing i did recently that you appreciated?', 3, '{gratitude}', 7),
  ('reflect', 'when did you feel most connected to me lately?', 3, '{}', 7),
  ('reflect', 'what do you think we''re best at as a couple?', 3, '{}', 7),
  ('reflect', 'what does feeling loved look like for you?', 3, '{}', 7),
  ('reflect', 'what are you most grateful for about us right now?', 3, '{gratitude}', 7),
  ('reflect', 'when do you feel most like yourself around me?', 3, '{}', 7),
  ('reflect', 'what''s something hard you''re carrying that i could help with?', 3, '{}', 7),
  ('reflect', 'what''s something you want us to get better at?', 3, '{}', 14),
  ('reflect', 'what''s a moment from this year you keep coming back to?', 3, '{memory}', 14),
  ('reflect', 'what''s something you''ve changed your mind about since we met?', 3, '{}', 14),
  ('reflect', 'what''s a version of our future you daydream about?', 3, '{future}', 14),
  ('reflect', 'what''s something you''ve never thanked me for?', 3, '{gratitude}', 30),
  ('reflect', 'what''s a fear you have that you haven''t said out loud?', 3, '{}', 30)
on conflict (body) do nothing;

-- tied (references an app surface, intimacy 1–2)
insert into daily_prompts (kind, body, intimacy, tags, min_shared_count) values
  ('tied', 'you''ve got free days coming up — what should we do with one?', 1, '{free_days}', 0),
  ('tied', 'add one thing to the vault you''d love for us to do together.', 1, '{vault}', 0),
  ('tied', 'what''s one date idea you''ve been sitting on?', 2, '{vault}', 0),
  ('tied', 'pick something from the vault you want to do next.', 1, '{vault}', 0),
  ('tied', 'anything you want to start saving towards together?', 2, '{pots}', 0),
  ('tied', 'what''s the next thing you''re counting down to?', 1, '{countdowns}', 0),
  ('tied', 'one thing we spent on recently — worth it, or not?', 2, '{ledger}', 0)
on conflict (body) do nothing;
