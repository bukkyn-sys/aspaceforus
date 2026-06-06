# Vault overhaul — three sections (Photos · To-dos · Lists)

| | |
|---|---|
| **Status** | Approved direction; not yet built |
| **Owner** | Bukky |
| **Origin** | Make the vault more useful: a Pinterest-style photo bank, robust to-do lists, and the existing list/wishlist vault — three sections under one tab. |
| **Decision date** | 2026-06-06 |

---

## 1. Grounding — what the vault is today
The current vault **is** the "Lists" section: `vault_folders` (kind `date_idea` / `wishlist` / `general`, `is_default`, emoji, name, `sort_order`) holding `vault_items` (title, `owner` = user-id|`shared`, url, notes, `price_range`, `og_image` = uploaded photo, `item_emoji`, `stage` ideas→planned→completed). Creator-edit rules, owner identity (accent + avatars), sort/filter, optimistic + realtime + cache, photo upload to the **public** `vault` bucket at `vault/{couple}/{user}/{uuid}`. See [vault-client.tsx](../src/app/(app)/vault/vault-client.tsx) / [actions.ts](../src/app/(app)/vault/actions.ts).

The overhaul keeps all of that as **Lists** and adds two new sections.

## 2. Locked decisions
- **Photos:** a default **"all" masonry wall + optional albums** (boards). Wall is the home; albums are opt-in organisation.
- **Photo privacy:** **private bucket + signed URLs** (like avatars/banners), not the current public-bucket-by-UUID pattern. Privacy is the product.
- **To-dos:** **core + advanced** — multiple lists, due dates, assignee, reorder, clear-completed, progress, **subtasks, recurring, and due reminders**.
- **Lists:** unchanged, nested under the Lists tab.

## 3. Information architecture
`/vault` becomes a 3-section surface:
- A **segmented control** at the top: **Photos · To-dos · Lists**. Active section persists via `?tab=` + cache.
- A **contextual FAB**: add photo(s) / add to-do (or list) / add item (or folder), per active section (reuses `useFabSetter`).
- Bottom-nav "vault" tab unchanged.

## 4. Section A — Photos (masonry wall + albums)

### Data
```sql
vault_albums (
  id uuid pk, couple_id uuid, created_by uuid,
  name text, cover_photo_id uuid null, sort_order int, created_at
)
vault_photos (
  id uuid pk, couple_id uuid, created_by uuid,
  album_id uuid null,            -- null = unsorted; always appears in the wall
  path text,                     -- private bucket object path
  width int, height int,         -- for reflow-free masonry
  caption text null, taken_at timestamptz null, created_at
)
```
- **Storage:** a new **private** bucket `photos`; objects at `{couple_id}/{uuid}.{ext}`. RLS via `is_couple_member((storage.foldername(name))[1]::uuid)`. Served through **signed URLs** (`SignedImg` / `use-signed-url`).
- **Wall:** newest-first **masonry** (2 cols mobile), using stored `width/height` so tiles never reflow on load. Albums shown as a chip row (`[ all ][ Trips ][ Us ][ + ]`); `all` is the default.
- **Lightbox:** tap a tile → full-screen viewer: swipe between photos, caption (editable), who added + when, **download**, **delete**, **move to album**.
- **Upload:** multi-select batch; client-side **downscale** (cap longest edge, e.g. 2048px) + read intrinsic dimensions before upload; optimistic placeholder tiles with progress; reuse `validateImage`.
- **Albums:** create/rename/delete; set cover; move photos in/out. Deleting an album keeps its photos (album_id → null), never deletes images.

### Privacy on partner change (open decision — see §8)
Couple photos are intimate. Default: **archive-on-leave** (like the daily) so a new partner filling the same `couple_id` slot can't see the previous partner's photos — rather than the vault's keep-and-reassign model.

## 5. Section B — To-dos (core + advanced)

### Data
```sql
vault_todo_lists (
  id uuid pk, couple_id uuid, created_by uuid,
  title text, emoji text, sort_order int, created_at
)
vault_todos (
  id uuid pk, list_id uuid, couple_id uuid, created_by uuid,
  parent_id uuid null,                 -- subtask (one level)
  title text, notes text null,
  done bool default false, done_at timestamptz null, done_by uuid null,
  due_date date null,
  assignee text null,                  -- user-id | 'both' | null (unassigned)
  position double precision,           -- drag-reorder (sparse, re-balance as needed)
  recurrence text default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  remind bool default false,           -- send a due reminder
  created_at, updated_at
)
```
To-dos are **shared / couple-editable** (either partner can tick/edit), with attribution (`created_by`, `done_by`).

### Core behaviour
- Multiple **lists** (title + emoji); per-list **progress** ("3/8").
- Items: add/edit/delete; **check off** → strikethrough, sinks into a collapsible **"done"** group showing who/when; **uncheck** restores.
- **Due dates** with calm styling ("today" / "overdue" in muted terracotta — never punitive, no streaks).
- **Assignee**: you / partner / both / unassigned, accent-coded with avatars.
- **Drag-reorder** via `position`; **clear completed**.
- **Realtime**: `todo-{couple}` channel, `postgres_changes` (RLS-scoped; to-dos aren't reveal-gated like the daily, so row sync is fine), optimistic + own-insert skip.
- **Push**: partner nudged on add and on complete ("{partner} ticked '…'"), via `notifyPartner` (10-min throttle).

### Advanced
- **Subtasks**: `parent_id`, one level; parent shows subtask progress; completing all subtasks can auto-suggest completing the parent.
- **Recurring**: on completing a recurring item, spawn the next occurrence (roll `due_date` by the interval); the completed instance stays in history.
- **Reminders**: a cron (reuse the engagement-cron pattern) scans `due_date <= today AND not done AND remind`, pushes a reminder, throttled per recipient/day. New `vault_reminders` bookkeeping or reuse the push throttle column.

## 6. Section C — Lists (unchanged)
Keep `vault_folders` / `vault_items` and every current behaviour. Only change: rendered under the **Lists** tab; its header/FAB move into the section. No schema change.

## 7. Dependency / ripple
| Surface | Change |
|---|---|
| [vault-client.tsx](../src/app/(app)/vault/vault-client.tsx) | Section shell (segmented tabs) + Photos + To-dos UIs; current code → Lists section |
| [vault/actions.ts](../src/app/(app)/vault/actions.ts) | New server actions for photos + to-dos (existing kept) |
| Supabase | New tables + RLS (`is_couple_member`), private `photos` bucket + policies, to-do reminder cron |
| `leave_couple_for_user` | Photos: archive-on-leave (privacy); to-dos: reassign `created_by`/keep (mundane), like vault items |
| FAB | Contextual per section (`useFabSetter`) |
| Notifications / `get_home_data` partner-activity | Optionally enrich ("added a photo" / "ticked a to-do") |
| Analytics | `photo_added`, `album_created`, `todo_added`, `todo_completed`, `todo_list_created` |
| Realtime | New `photos-{couple}` / `todo-{couple}` channels |
| Cron (GitHub Actions) | New (or extended) job for to-do due reminders |

## 8. Open decisions / follow-ups
1. **Photo retention on partner change** — archive-on-leave (privacy-first, recommended) vs keep-and-reassign (matches vault). Defaulting to archive.
2. **Reminder timing** — what local hour to fire due reminders (tz wedge again); reuse UK-daytime cron windows for v1.
3. **Recurring semantics** — roll from due date vs from completion date when overdue.
4. **Storage cost** — private bucket + many photos; set an upload size cap and downscale; revisit quota before public launch.

## 9. Phasing
1. **Section shell + Lists** — segmented tabs; move current vault under Lists; contextual FAB. Low risk, ships first.
2. **To-dos core** — lists, items, done+attribution, due, assignee, reorder, clear-completed, progress, realtime, push.
3. **To-dos advanced** — subtasks, recurring, reminders cron.
4. **Photos** — private bucket, multi-upload + downscale + dimensions, masonry wall, lightbox.
5. **Albums + photo retention-on-leave** — album CRUD, move/cover; archive-on-leave hook.

## 10. Calm-brand guardrails
- To-dos must not feel like a productivity tool: muted due styling, no red overload, no streaks, no nags beyond a single gentle reminder.
- Photos: generous spacing, soft corners, no like-counts or social affordances — a private shared wall, not a feed.
