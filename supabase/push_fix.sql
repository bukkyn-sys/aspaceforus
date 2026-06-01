-- ════════════════════════════════════════════════════════════════════════════
-- PUSH FIX — run once in the Supabase SQL editor.
--
-- The security_hardening.sql patch reconstructed two push functions to read/write
-- a `profiles.push_subscription` column that DOES NOT EXIST (push data actually
-- lives in the `push_subscriptions` table). plpgsql column refs aren't validated
-- until runtime, so the functions were created fine but fail when push runs.
-- These corrected versions use the real `push_subscriptions(user_id, endpoint,
-- p256dh, auth)` table and keep the auth.uid() hardening.
-- ════════════════════════════════════════════════════════════════════════════

-- Save the current device's subscription for the signed-in user.
-- The app passes the browser PushSubscription as JSON: { endpoint, keys:{p256dh,auth} }.
create or replace function save_push_subscription(p_user_id uuid, p_couple_id uuid, p_subscription jsonb)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (
    p_user_id,
    p_subscription->>'endpoint',
    p_subscription->'keys'->>'p256dh',
    p_subscription->'keys'->>'auth'
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh  = excluded.p256dh,
    auth    = excluded.auth;
end; $$;

-- Return the partner's most recent subscription, shaped for the web-push library
-- ({ endpoint, keys:{p256dh,auth} }). Server-side only (notifyPartner).
create or replace function get_partner_push_subscription(p_couple_id uuid, p_my_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;
  return (
    select jsonb_build_object(
      'endpoint', ps.endpoint,
      'keys', jsonb_build_object('p256dh', ps.p256dh, 'auth', ps.auth)
    )
    from push_subscriptions ps
    join profiles pr on pr.id = ps.user_id
    where pr.couple_id = p_couple_id and ps.user_id <> p_my_id
    order by ps.created_at desc nulls last
    limit 1
  );
end; $$;
