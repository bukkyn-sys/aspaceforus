-- ════════════════════════════════════════════════════════════════════════════
-- H4 — Realtime Authorization for broadcast channels.
--
-- Today the app's broadcast channels (`notif-<couple_id>`, `dash-<couple_id>`)
-- are PUBLIC: any authenticated client that knows a couple's id could join and
-- read their live mood / activity broadcasts. (Low practical risk — couple_id is
-- an unguessable UUID never exposed to non-members — but we close it anyway.)
--
-- This adds RLS on realtime.messages so only a couple's own members may read or
-- send on that couple's topics. It is a NO-OP while the channels are still public
-- (public channels don't consult realtime.messages), so it is SAFE TO RUN NOW.
-- It only takes effect once the app marks the channels `private: true`.
--
-- Topic format: 'notif-' || couple_id   and   'dash-' || couple_id
-- ════════════════════════════════════════════════════════════════════════════

-- RLS is enabled on realtime.messages by default; ensure it.
alter table realtime.messages enable row level security;

drop policy if exists "couple members realtime" on realtime.messages;

-- One policy for ALL commands (SELECT = receive, INSERT = send). A member may
-- only touch topics that end with *their own* couple_id.
create policy "couple members realtime" on realtime.messages
  for all to authenticated
  using (
    realtime.topic() in (
      select t.topic from (
        select 'notif-' || p.couple_id::text as topic from profiles p where p.id = auth.uid()
        union all
        select 'dash-'  || p.couple_id::text          from profiles p where p.id = auth.uid()
      ) t
    )
  )
  with check (
    realtime.topic() in (
      select t.topic from (
        select 'notif-' || p.couple_id::text as topic from profiles p where p.id = auth.uid()
        union all
        select 'dash-'  || p.couple_id::text          from profiles p where p.id = auth.uid()
      ) t
    )
  );
