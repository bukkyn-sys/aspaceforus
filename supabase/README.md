# Database — current state & how to stop the migration sprawl

This folder grew organically into **~40 hand-run SQL files**, several of which
redefine the same objects (`get_home_data` has been rewritten 8+ times). There is
no single authoritative schema, which makes a fresh setup error-prone and risks
running files in the wrong order.

## The fix (recommended): adopt a real migration flow

The live database is the source of truth right now. Snapshot it once, then never
edit the DB by hand again:

```bash
# one-time: link the project
supabase link --project-ref <your-ref>

# snapshot the current live schema into a single migration
supabase db pull            # writes supabase/migrations/<timestamp>_remote_schema.sql

# from now on, every change is a new migration:
supabase migration new <name>     # edit the generated file
supabase db push                  # apply to the linked DB
```

Also generate types so the TS layer can't drift from the schema:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

Once `db pull` exists, the loose files below can be archived — keep them only as
history.

## Until then — canonical run order (fresh DB)

Run these in the Supabase SQL editor, top to bottom. Each is idempotent.

1. `schema.sql` — base tables, RLS, core RPCs
2. `run_pending.sql` — albums + photo `archived_at`, photo favourites,
   `clear_couple_availability`, vault realtime, **countdowns → events** merge
3. `calendar_dayparts_rebuild.sql` — events reshaped to day-parts + `note_items`
4. `events_attendee.sql` — event attendees + `get_home_data` carrying attendee/parts

The remaining feature files (`daily_mechanic.sql`, `vault_*.sql`, `security_*.sql`,
etc.) layer in earlier features; if starting truly fresh, prefer `db pull` over
replaying them.

## Gotchas learned the hard way

- The SQL editor runs the whole script as **one transaction** — a mid-script
  failure rolls everything back.
- A **new table is invisible to realtime** until added to the `supabase_realtime`
  publication (see the DO-blocks in `run_pending.sql`).
- Helpers used inside policies must be `SECURITY DEFINER` + `set search_path =
  public` (e.g. `is_couple_member`), or RLS recurses.
