-- ════════════════════════════════════════════════════════════════════════════
-- Brute-force protection for redeem_beta_code (security review 2026-06).
--
-- redeem_beta_code() is caller-guarded (couple derived from auth.uid()) but had
-- NO throttle, so a user could hammer it to guess a valid code and unlock a year
-- of free premium. This adds the same 10-attempts-per-15-min limit the join flow
-- uses, reusing the existing join_attempts table so we don't add another.
--
-- Idempotent. Run AFTER monetization_beta_codes.sql and join_rate_limit.sql.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function redeem_beta_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_couple_id uuid;
  v_code      beta_codes%rowtype;
  v_attempts  int;
begin
  select couple_id into v_couple_id from profiles where id = auth.uid();
  if v_couple_id is null then return 'no_couple'; end if;

  -- Rate-limit failed guesses (shared bucket with join attempts).
  select count(*) into v_attempts from join_attempts
    where user_id = auth.uid() and attempted_at > now() - interval '15 minutes';
  if v_attempts >= 10 then return 'rate_limited'; end if;

  select * into v_code from beta_codes
    where lower(code) = lower(trim(p_code)) and active;
  if not found then
    insert into join_attempts (user_id) values (auth.uid());  -- count the miss
    return 'not_found';
  end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    return 'exhausted';
  end if;

  update couples
    set premium_override_until = greatest(
          coalesce(premium_override_until, now()),
          now() + make_interval(days => v_code.premium_days)
        )
    where id = v_couple_id;

  update beta_codes set used_count = used_count + 1 where code = v_code.code;
  return 'ok';
end;
$$;
