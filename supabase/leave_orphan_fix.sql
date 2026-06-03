-- ════════════════════════════════════════════════════════════════════════════
-- Task 6 — handle orphaned rows when a partner leaves a couple.
--
-- AUDIT: the previous leave_couple_for_user only did
--   update profiles set couple_id = null where id = p_user_id;
-- so the leaving user's rows stayed in the space with created_by pointing at a
-- person no longer in the couple:
--   • vault_items / events — became un-editable via the app (created_by filter)
--     and rendered with the "shared" owner fallback.
--   • ledger_entries / savings_pots — likewise kept the departed creator.
--
-- FIX: before unlinking, hand the leaving user's vault_items and events to the
-- remaining partner (created_by -> partner). ledger_entries keep their created_by
-- (a financial record of who logged the expense); the remaining partner can still
-- manage them because the ledger RLS policy is couple-scoped (see note below).
-- (savings_pots are intentionally left as-is — not in scope; couple-scoped RLS
-- already lets the partner delete/contribute.)
--
-- NOTE — ledger RLS: `ledger_entries_all` is `for all using is_couple_member(couple_id)`,
-- so any couple member (the remaining partner) is permitted to edit/delete at the
-- DB level. No RLS change is required.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function leave_couple_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_couple  uuid;
  v_partner uuid;
begin
  -- SECURITY: callers may only remove themselves from a couple.
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;

  select couple_id into v_couple from profiles where id = p_user_id;

  if v_couple is not null then
    select id into v_partner from profiles
      where couple_id = v_couple and id <> p_user_id
      limit 1;

    -- Reassign only if a partner remains to receive the items.
    if v_partner is not null then
      update vault_items set created_by = v_partner
        where couple_id = v_couple and created_by = p_user_id;
      update events set created_by = v_partner
        where couple_id = v_couple and created_by = p_user_id;
      -- ledger_entries: keep created_by (RLS already permits partner edit/delete).
    end if;
  end if;

  update profiles set couple_id = null where id = p_user_id;
end; $$;
