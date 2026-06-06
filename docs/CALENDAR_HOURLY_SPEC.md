# Calendar overhaul — hourly planning & part-day availability

| | |
|---|---|
| **Status** | Approved direction; Phase 1 in progress |
| **Owner** | Bukky |
| **Origin** | Focus-group feedback: couples want hour-level planning *and* the ability to show partial-day availability (free half-days). |
| **Decision date** | 2026-06-06 |

---

## 1. Problem & the two needs

Focus groups conflated two needs with very different costs:

| Need | Meaning | Today | Cost |
|---|---|---|---|
| **Plan by the hour** | Events have real start/end times (dinner 7–9pm) | `events.start_at/end_at` are already `timestamptz`, but the UI pins everything to `T12:00:00` and renders by day | **Low** — UI unlock only |
| **Free half-days / partial availability** | Availability is sub-day ("free Saturday afternoon") | One free/not-free flag per whole day (`availability(couple,user,date,status)`) | **High** — core model change |

The two ship at different risk levels, so the work is **phased**.

## 2. Locked decisions

- **Availability granularity:** **day-parts**, not free-ranges or 24 hourly toggles. Calm, half-day-native, keeps overlap as set-intersection.
- **Parts (4):** `morning`, `afternoon`, `evening`, `night`.
  - Display bands: **morning 05:00–12:00 · afternoon 12:00–17:00 · evening 17:00–22:00 · night 22:00–05:00** (night is labelled under the starting date).
- **Events:** keep precise `start_at`/`end_at`; add an `all_day` flag. Hour-level planning lives here.
- **Calendar structure:** **month overview → tap-in day timeline**. Month grid stays for navigation/overview; a day view is where hourly planning happens.
- **Timezone:** timed events are stored UTC (`timestamptz`) and **rendered in each viewer's local timezone**. Day-parts are tz-agnostic (date + part, in each viewer's local sense). Long-distance couples near a date boundary can occasionally differ by a day — accepted for v1 (same wedge as the daily's 4am rollover), `TODO` left.
- **"All-day" storage:** availability all-day = the **four part-rows** (no special case); events all-day = the **`all_day` flag**.
- **Countdowns:** unchanged — day-based "looking forward to" markers, not scheduled blocks.

## 3. Data model (target)

**`availability` → part-rows** (replaces the whole-day row):
```sql
availability (
  id, couple_id, user_id,
  date date,
  part text check (part in ('morning','afternoon','evening','night')),
  unique (couple_id, user_id, date, part)
)
```
Presence of a row = "free that part." `status` is dropped (presence = free). All-day = four rows.

**`events`** — add `all_day boolean default false`; `start_at`/`end_at` keep their real times. Timed events render at their hour; all-day events render as a chip.

**`countdowns`** — unchanged.

## 4. Overlap / "free together"

- A `(date, part)` is **free-together** when *both* partners have a row for it.
- A day can be **partially** together (free Sat afternoon, not morning).
- Home's card changes from *"next free **days**"* to *"next free **windows**"* — first 3 `(date, part)` overlaps over 60 days → "Saturday afternoon".

## 5. RPC changes

- `set_availability(p_couple_id, p_date, p_part, p_free)` — toggle one part (replaces date+status). Optional `set_availability_day(p_date, p_free)` writes all four parts.
- `get_home_data` `v_free` → next free **windows** as `[{date, part}]`.

## 6. UI

- **Month cell:** day number + event emoji (unchanged) + a slim **4-segment availability bar** under the number (segment per part; tinted for you / highlighted when both-free). Legible at grid size, stays calm.
- **Day timeline (new, tap-in):** four part bands, each tappable to toggle your availability, showing partner state + both-free highlight, with the day's **timed events at their hour** inside. Add-event from here.
- **Add/edit event sheet:** date pickers + **start/end time pickers + an "all day" toggle**.

## 7. Dependency blast radius

| # | Surface / file | Change | Phase |
|---|---|---|---|
| 1 | `events.all_day` column + backfill | add flag; existing noon events → all-day | 1 |
| 2 | [calendar/actions.ts](../src/app/(app)/calendar/actions.ts) | events carry times + `all_day` | 1 |
| 3 | [calendar-client.tsx](../src/app/(app)/calendar/calendar-client.tsx) event sheet + list | time pickers, all-day toggle, render times | 1 |
| 4 | `availability` table + `set_availability` RPC | replace with part-rows | 2 |
| 5 | calendar-client month bars + **day timeline** | partial-availability rendering + tap-in day view | 2 |
| 6 | [get_home_data.sql](../supabase/get_home_data.sql) `v_free` | free-days → free-windows | 2 |
| 7 | [dashboard-client.tsx](../src/app/(app)/home/dashboard-client.tsx) | "next free windows"; **plan** prefills event time from the window; part-aware range clearing | 2 |
| 8 | daily `tied` free_days prompt → `/calendar` | optional deep-link to day timeline | 3 |
| 9 | analytics | `event_created{has_time, all_day}`, new `availability_set{part}` | 1–2 |
| 10 | availability migration | each current free day → its four part-rows | 2 |
| 11 | PSD §8.4 / §12 / decisions log | document the overhaul | 2–3 |

## 8. Phasing

- **Phase 1 — timed events** (no availability model change): `all_day` column + backfill, time pickers + all-day toggle in the event sheet, render real times in the events list. Delivers the headline "plan by the hour." Ships independently. *Tapping a day keeps the existing whole-day availability toggle until Phase 2.*
- **Phase 2 — day-parts availability:** new `availability` shape + RPC, month 4-segment bars, the tap-in **day timeline**, Home "free windows", data migration.
- **Phase 3 — polish:** partial-availability rendering refinement, timezone display polish, daily-prompt deep-link, PSD update.

## 9. Calm-brand guardrails

- No 24-toggle hour grid — day-parts only, to preserve "calm over loud."
- Partial-availability must read at month-grid size (segmented bar, never text).
- Timezones: render in viewer-local; never surprise a partner with a time that isn't theirs.

## 10. Risks / open follow-ups

- Long-distance date-boundary divergence (accepted v1; revisit with LDR data).
- Night band wraps midnight — labelled under the start date; ensure event→part mapping uses local start hour.
- Migration must be idempotent and lossless (no marked day disappears).
