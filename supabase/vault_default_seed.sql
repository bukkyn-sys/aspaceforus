-- ════════════════════════════════════════════════════════════════════════════
-- Seed the two default vault folders ONCE, at couple creation.
--
-- They used to be seeded client-side "whenever the vault has zero folders", which
-- meant deleting both defaults made them reappear on the next load. Now they're
-- created with the space and never re-seeded, so deleting them sticks.
-- (deleteVaultFolder also dropped its is_default guard so defaults are deletable.)
--
-- is_default = true bypasses the folder quota trigger, so seeding works even
-- before the couple is premium. Idempotent. Run AFTER trial_on_pairing.sql.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function create_couple_for_user(p_user_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_couple_id uuid; v_code text;
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into couples default values returning id, invite_code into v_couple_id, v_code;
  update profiles set couple_id = v_couple_id where id = p_user_id;

  -- Starter folders (deletable; never re-seeded).
  insert into vault_folders (couple_id, created_by, name, emoji, kind, is_default, sort_order)
  values
    (v_couple_id, p_user_id, 'date ideas', '🌹', 'date_idea', true, 0),
    (v_couple_id, p_user_id, 'wishlist',   '🎁', 'wishlist',  true, 1);

  -- Trial is granted on pairing (see grant_couple_trial in the join paths).
  return v_code;
end; $$;
