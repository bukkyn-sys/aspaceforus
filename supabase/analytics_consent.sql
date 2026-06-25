-- ════════════════════════════════════════════════════════════════════════════
-- Durable analytics-consent record on the profile. localStorage alone doesn't
-- survive iOS PWA storage eviction / separate PWA-vs-Safari storage / different
-- origins, so the consent banner kept re-appearing. This persists the decision
-- server-side (also the right place for a GDPR consent record). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists analytics_consent text
  check (analytics_consent in ('granted', 'denied'));

create or replace function set_analytics_consent(p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  if p_value is not null and p_value not in ('granted', 'denied') then
    raise exception 'invalid value';
  end if;
  update profiles set analytics_consent = p_value where id = auth.uid();
end; $$;

revoke execute on function set_analytics_consent(text) from anon;
