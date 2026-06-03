-- ════════════════════════════════════════════════════════════════════════════
-- Throttle push notifications: only the FIRST notification to a given recipient
-- in any 10-minute window is delivered; the rest are silently skipped until the
-- window passes. Stops a burst of activity from spamming the partner.
--
-- Implemented inside get_partner_push_subscription (called only by notifyPartner):
-- it now claims a per-recipient slot and returns null when throttled, so the
-- server simply has nothing to send. No app code change required.
-- ════════════════════════════════════════════════════════════════════════════

alter table push_subscriptions add column if not exists last_notified_at timestamptz;

create or replace function get_partner_push_subscription(p_couple_id uuid, p_my_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid;
  v_endpoint text;
  v_p256     text;
  v_auth     text;
  v_last     timestamptz;
begin
  if p_my_id <> auth.uid() or not is_couple_member(p_couple_id) then
    raise exception 'forbidden';
  end if;

  select ps.user_id, ps.endpoint, ps.p256dh, ps.auth, ps.last_notified_at
    into v_id, v_endpoint, v_p256, v_auth, v_last
    from push_subscriptions ps
    join profiles pr on pr.id = ps.user_id
    where pr.couple_id = p_couple_id and ps.user_id <> p_my_id
    order by ps.created_at desc nulls last
    limit 1;

  if v_endpoint is null then
    return null;
  end if;

  -- Throttle window: 10 minutes per recipient.
  if v_last is not null and v_last > now() - interval '10 minutes' then
    return null;
  end if;

  -- Claim the slot (covers all of this recipient's devices).
  update push_subscriptions set last_notified_at = now() where user_id = v_id;

  return jsonb_build_object(
    'endpoint', v_endpoint,
    'keys', jsonb_build_object('p256dh', v_p256, 'auth', v_auth)
  );
end; $$;
