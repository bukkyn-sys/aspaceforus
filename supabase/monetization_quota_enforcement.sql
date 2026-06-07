-- ════════════════════════════════════════════════════════════════════════════
-- MONETIZATION — server-side quota enforcement (the un-bypassable layer)
--
-- The app gates premium features in the UI, but a determined client could call
-- the API directly. These BEFORE INSERT triggers reject over-quota writes at the
-- database, so the limits hold no matter how the write arrives. Legit free users
-- never hit them (the UI stops them first); this is purely a backstop.
--
-- Mirrors is_premium() from monetization_phase1.sql, so beta testers (comped) and
-- subscribers pass. Run after monetization_phase1.sql + monetization_beta_codes.sql.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── To-do lists: free = 2 ─────────────────────────────────────────────────────
create or replace function enforce_list_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from vault_todo_lists where couple_id = NEW.couple_id) >= 2 then
    raise exception 'free plan allows 2 to-do lists' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_list_quota on vault_todo_lists;
create trigger trg_list_quota before insert on vault_todo_lists
  for each row execute function enforce_list_quota();

-- ── Savings pots: free = 1 ────────────────────────────────────────────────────
create or replace function enforce_pot_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from savings_pots where couple_id = NEW.couple_id) >= 1 then
    raise exception 'free plan allows 1 savings pot' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_pot_quota on savings_pots;
create trigger trg_pot_quota before insert on savings_pots
  for each row execute function enforce_pot_quota();

-- ── Photos: free = 50 (non-archived) ──────────────────────────────────────────
create or replace function enforce_photo_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from vault_photos where couple_id = NEW.couple_id and archived_at is null) >= 50 then
    raise exception 'free plan allows 50 photos' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_photo_quota on vault_photos;
create trigger trg_photo_quota before insert on vault_photos
  for each row execute function enforce_photo_quota();

-- ── Photo albums: free = 1 ────────────────────────────────────────────────────
create or replace function enforce_album_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(NEW.couple_id)
     and (select count(*) from vault_albums where couple_id = NEW.couple_id) >= 1 then
    raise exception 'free plan allows 1 album' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_album_quota on vault_albums;
create trigger trg_album_quota before insert on vault_albums
  for each row execute function enforce_album_quota();

-- ── Vault folders: free keeps only the seeded starter folders ─────────────────
-- Defaults (is_default = true) seed freely; a free user can't add custom folders.
create or replace function enforce_folder_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(NEW.is_default, false) = false and not is_premium(NEW.couple_id) then
    raise exception 'custom folders are a premium feature' using errcode = 'check_violation';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_folder_quota on vault_folders;
create trigger trg_folder_quota before insert on vault_folders
  for each row execute function enforce_folder_quota();

-- ── Premium-only couple settings (layout + custom banner) ─────────────────────
-- Re-defined from dashboard_layout.sql / security_hardening.sql with a premium gate.
create or replace function set_dashboard_layout(p_couple_id uuid, p_layout jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;
  if not is_premium(p_couple_id) then raise exception 'custom layout is a premium feature'; end if;
  update couples set dashboard_layout = p_layout where id = p_couple_id;
end; $$;

create or replace function update_couple_banner(p_couple_id uuid, p_user_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  -- Free users may clear a banner but not set a custom one.
  if p_url is not null and not is_premium(p_couple_id) then
    raise exception 'a custom banner is a premium feature';
  end if;
  update couples set banner_url = p_url where id = p_couple_id;
end; $$;

-- NOTE — calendar future-month planning is enforced in the client only. A DB
-- trigger would need the user's timezone to know "the current month", and a UTC
-- approximation risks false-blocking legit current-month writes at boundaries.
