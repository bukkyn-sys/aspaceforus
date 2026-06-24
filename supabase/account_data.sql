-- ════════════════════════════════════════════════════════════════════════════
-- GDPR: account deletion (right to erasure) + data export (right to access).
-- Two SECURITY DEFINER RPCs called by the caller for themselves only.
-- Idempotent. Run in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── delete_my_account() ──────────────────────────────────────────────────────
-- Deletes the caller. If they have a partner, their authored shared content is
-- reassigned to the partner so the space keeps working (and the intimate "daily"
-- is archived, matching leave_couple). If they are the only member, the whole
-- couple is deleted (cascades all couple-scoped data). Finally the auth user is
-- removed, which cascades the profile, push subscriptions, availability,
-- daily_responses and join_requests.
--
-- NOTE: cancel any active Stripe subscription in the server action BEFORE calling
-- this (deleting the couple here removes our local record but not the Stripe sub).
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_couple  uuid;
  v_partner uuid;
begin
  if v_uid is null then raise exception 'forbidden'; end if;

  select couple_id into v_couple from profiles where id = v_uid;

  if v_couple is not null then
    select id into v_partner from profiles where couple_id = v_couple and id <> v_uid limit 1;

    if v_partner is not null then
      -- Reassign authored (NOT NULL) ownership to the partner.
      update countdowns       set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update events           set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_items      set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update ledger_entries   set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update ledger_entries   set paid_by    = v_partner where couple_id = v_couple and paid_by    = v_uid;
      update savings_pots     set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update sounding_board   set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_folders    set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update pot_folders      set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_photos     set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_albums     set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_todos      set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update vault_todo_lists set created_by = v_partner where couple_id = v_couple and created_by = v_uid;
      update note_items       set created_by = v_partner where couple_id = v_couple and created_by = v_uid;

      -- Nullable references to the departing user → clear them.
      update vault_items set bought_by = null where couple_id = v_couple and bought_by = v_uid;
      update vault_todos set done_by   = null where couple_id = v_couple and done_by   = v_uid;
      update events      set attendee  = null where couple_id = v_couple and attendee  = v_uid;

      -- Intimate two-person content → archive (responses are reachable only via a
      -- non-archived moment, so this hides them everywhere for the new partner).
      update daily_moments set archived_at = now() where couple_id = v_couple and archived_at is null;
    else
      -- Solo: remove the whole couple; every couple-scoped table cascades.
      delete from couples where id = v_couple;
    end if;
  end if;

  -- Remove the identity. profiles + push_subscriptions + availability +
  -- daily_responses + join_requests all cascade on auth.users delete.
  delete from auth.users where id = v_uid;
end; $$;

-- ── export_my_data() ─────────────────────────────────────────────────────────
-- Returns a single JSON document of the caller's profile and their couple's
-- shared content, for the "download my data" action.
create or replace function export_my_data()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid;
  v_out    json;
begin
  if v_uid is null then raise exception 'forbidden'; end if;
  select couple_id into v_couple from profiles where id = v_uid;

  select json_build_object(
    'exported_at', now(),
    'profile',     (select row_to_json(p) from (select id, display_name, avatar_url, accent_color, current_mood, created_at from profiles where id = v_uid) p),
    'couple',      (select row_to_json(c) from (select id, started_at, shared_note, currency, banner_url, created_at from couples where id = v_couple) c),
    'events',         coalesce((select json_agg(row_to_json(t)) from (select * from events           where couple_id = v_couple) t), '[]'::json),
    'countdowns',     coalesce((select json_agg(row_to_json(t)) from (select * from countdowns       where couple_id = v_couple) t), '[]'::json),
    'availability',   coalesce((select json_agg(row_to_json(t)) from (select * from availability     where couple_id = v_couple) t), '[]'::json),
    'vault_folders',  coalesce((select json_agg(row_to_json(t)) from (select * from vault_folders    where couple_id = v_couple) t), '[]'::json),
    'vault_items',    coalesce((select json_agg(row_to_json(t)) from (select * from vault_items      where couple_id = v_couple) t), '[]'::json),
    'vault_photos',   coalesce((select json_agg(row_to_json(t)) from (select * from vault_photos     where couple_id = v_couple) t), '[]'::json),
    'vault_albums',   coalesce((select json_agg(row_to_json(t)) from (select * from vault_albums     where couple_id = v_couple) t), '[]'::json),
    'vault_todo_lists', coalesce((select json_agg(row_to_json(t)) from (select * from vault_todo_lists where couple_id = v_couple) t), '[]'::json),
    'vault_todos',    coalesce((select json_agg(row_to_json(t)) from (select * from vault_todos      where couple_id = v_couple) t), '[]'::json),
    'ledger_entries', coalesce((select json_agg(row_to_json(t)) from (select * from ledger_entries   where couple_id = v_couple) t), '[]'::json),
    'savings_pots',   coalesce((select json_agg(row_to_json(t)) from (select * from savings_pots     where couple_id = v_couple) t), '[]'::json),
    'pot_folders',    coalesce((select json_agg(row_to_json(t)) from (select * from pot_folders      where couple_id = v_couple) t), '[]'::json),
    'note_items',     coalesce((select json_agg(row_to_json(t)) from (select * from note_items       where couple_id = v_couple) t), '[]'::json),
    'daily',          coalesce((select json_agg(row_to_json(t)) from (
                         select dm.moment_date, dp.body as prompt,
                                (select body from daily_responses r where r.moment_id = dm.id and r.user_id = v_uid) as my_answer
                         from daily_moments dm join daily_prompts dp on dp.id = dm.prompt_id
                         where dm.couple_id = v_couple and dm.archived_at is null) t), '[]'::json)
  ) into v_out;

  return v_out;
end; $$;

-- Only the authenticated caller may run these (defence-in-depth alongside the
-- internal auth.uid() guards). Service role keeps execute as table owner.
revoke execute on function delete_my_account()  from anon;
revoke execute on function export_my_data()     from anon;
