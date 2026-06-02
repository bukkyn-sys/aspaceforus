# us. / aspaceforus — Full Engineering & Product Review (Checklist)

> **Created:** 2026-06-01 · **Reviewer:** Claude (Opus) · **Purpose:** Persistent, self-contained record of a full-codebase critique so work can continue across fresh context windows. Every item below includes enough file/line detail and the *reasoning* to act on it without re-reading the whole codebase.

**How to use this file:** Work top-to-bottom by severity. Check off `[x]` as completed and add a one-line note of what changed + commit hash. The "Status" column tracks progress.

---

## Verdict (TL;DR)

Impressive solo build. Strong product thinking, cohesive premium visual language, sophisticated optimistic-update + cache + realtime architecture. BUT:
- **One critical security vulnerability** (IDOR in security-definer RPCs) — fix immediately.
- **Schema drift** — the committed `schema.sql` cannot rebuild the real DB.
- Scattering of correctness bugs and React anti-patterns.

Tech stack: Next.js 14 App Router, Supabase (Postgres + RLS + Realtime + Storage), Tailwind v4, framer-motion, Vercel PWA. ~6,900 lines across `src/`.

---

## 🔴 CRITICAL

### [x] 1. Security-definer RPCs trust a client-supplied user ID (IDOR / privilege escalation)
**Status:** ✅ DONE & APPLIED (2026-06-01). `security_hardening.sql` ran successfully in the live Supabase DB — all 16 RPCs now assert `auth.uid()` + pin `search_path`. Repo `schema.sql` also patched. IDOR closed.
**Severity:** Critical
**Files:** `supabase/schema.sql` (functions at lines ~182, 197, 227, 235, 251, 265, 274) + all the *uncommitted* RPCs (see item 2).

**The problem:** Every privileged function is `security definer` (runs as table owner, **bypasses RLS**) and identifies the acting user from a `p_user_id` *argument* passed by the client, instead of from `auth.uid()`. PostgREST exposes all of these to any authenticated user; nothing revokes execute. Example shape:
```sql
create function update_my_mood(p_user_id uuid, p_mood int)
returns void language plpgsql security definer as $$
begin
  update profiles set current_mood = p_mood where id = p_user_id;  -- TRUSTS THE ARG
end; $$;
```
**Exploit (from browser console, signed in as anyone):**
```js
supabase.rpc('leave_couple_for_user', { p_user_id: '<any-victim-uuid>' })   // eject anyone from their couple
supabase.rpc('get_session_data',      { p_user_id: '<any-uuid>' })          // read their name/avatar/mood/couple
supabase.rpc('update_my_display_name',{ p_user_id: '<victim>', p_name: 'x' })// rename anyone
supabase.rpc('update_my_mood',        { p_user_id: '<victim>', p_mood: 1 }) // change anyone's mood
```
**Impact:** Horizontal privilege escalation — any logged-in user can read any profile, rename/modify any user, forcibly eject anyone from their couple, create/join couples on others' behalf.

**Functions to fix (every security-definer fn that takes a user/couple id):**
`get_my_profile`, `get_session_data`, `get_partner_profile`, `update_my_mood`, `update_my_display_name`, `update_accent_color`, `create_couple_for_user`, `join_couple_for_user`, `leave_couple_for_user`, `update_shared_note`, `update_couple_started_at`, `update_couple_banner`, `set_availability`, `mark_section_activity`, `save_push_subscription`, `get_partner_push_subscription`.

**Fix pattern A (preferred — derive from session, drop the arg):**
```sql
create or replace function update_my_mood(p_mood int)
returns void language plpgsql security definer
set search_path = public as $$
begin
  update profiles set current_mood = p_mood where id = auth.uid();
end; $$;
```
**Fix pattern B (if you can't change the signature without touching many call sites — assert):**
```sql
if p_user_id <> auth.uid() then raise exception 'forbidden'; end if;
```
For couple-scoped reads like `get_partner_profile(p_couple_id, p_my_id)`: assert the caller is actually a member of `p_couple_id` (`if not is_couple_member(p_couple_id) then raise exception 'forbidden'; end if;`) AND that `p_my_id = auth.uid()`.

**Also:**
- Add `set search_path = public` to **every** `security definer` function (prevents search-path hijacking).
- Consider `revoke execute on function <fn> from anon;` for anything that must not be callable pre-auth.

**Decision needed:** Pattern A changes RPC signatures → must update server-action call sites in the same change. Pattern B is lower-blast-radius. Recommend **Pattern B (assert)** to minimize churn, since it preserves signatures and is a pure additive guard. (Confirm with user before editing call sites.)

---

### [x] 2. Committed schema can't rebuild the database (schema drift)
**Status:** ✅ DONE (2026-06-02). Captured the live DB via SQL-editor introspection (CLI `db dump` needs Docker, which isn't installed). `schema.sql` now has a "PRODUCTION REALITY CAPTURE" appendix with the real `profiles`/`couples` columns, the `push_subscriptions` table, and notes on legacy unused tables/functions. NOTE: profiles has NO `push_subscription` column — push lives in the `push_subscriptions` table. This caused a regression — see item #21.
**Severity:** Critical (operational/DR risk)
**File:** `supabase/schema.sql`

**The problem:** The committed schema is significantly out of sync with production. Referenced by the app but **absent from the file**:
- **Columns:** `profiles.accent_color`, `profiles.current_mood`, `profiles.mood_updated_at`, `profiles.activity_at`, `profiles.push_subscription`; `couples.shared_note`, `couples.started_at`, `couples.banner_url`. (`couples.invite_code` IS present.)
- **Functions:** `get_partner_profile`, `mark_section_activity`, `save_push_subscription`, `get_partner_push_subscription`, `update_shared_note`, `update_couple_started_at`, `set_availability`, `update_accent_color`, `update_couple_banner` — none defined in the file. They were applied directly in the Supabase dashboard.

**Risk:** No staging/DR reproducibility, no migration history. Source of truth lives only in a live DB.

**Fix options:**
- Best: adopt Supabase CLI migrations (`supabase migration new`, `supabase db diff`).
- Minimum: `supabase db dump --schema public > supabase/schema.sql` (or copy the live SQL) so the file is authoritative again.

**Minor related drift (note while in there):**
- `availability.status` still `check (status in ('free','busy'))` (line ~48) though "busy" was removed from the UI. Harmless but stale.
- Base `vault_items.owner` check `('shared','his','hers')` is dropped by a later migration block — re-running the file top-to-bottom on a fresh DB briefly disagrees with the app (owner now stores profile UUIDs).

---

## 🟠 HIGH / MEDIUM

### [x] 3. Scroll-lock targets the wrong element — background scrolls behind every sheet
**Status:** DONE (commit pending). Fixed hook to lock document.body.
**Severity:** Medium (UX)
**File:** `src/lib/use-scroll-lock.ts:7`

**The problem:** `useScrollLock` sets `main.style.overflow = "hidden"`, but `<main>` is NOT the scroller — the **window/body** is (the `(app)` layout's outer div is `min-h-dvh` (min-height only), so `<main>` grows with content and the body scrolls). So the hook is a no-op: open any `BottomSheet`/`Dialog` and the page behind still scrolls. (Same root cause as the pull-to-refresh bug.)

**Fix:**
```ts
import { useEffect } from "react";
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}
```
Note: `CropModal` (`src/app/(app)/profile/profile-client.tsx:64`) already does the body-lock correctly — so only the shared hook is broken. After fixing, the BottomSheet/Dialog (which call `useScrollLock`) will correctly lock.

---

### [x] 4. Ledger "settle up" has no confirmation
**Status:** DONE (commit pending). Added settle-up confirmation Dialog.
**Severity:** Medium (data-loss UX)
**File:** `src/app/(app)/ledger/ledger-client.tsx:714` (the settle button), handler `handleSettle` at :306

**The problem:** Tapping "settle up" immediately wipes all non-recurring expenses and writes a settled batch — irreversibly, one tap, no confirm. It's the most consequential action (zeroes a shared financial balance), yet every *other* destructive action gets a Dialog.

**Fix:** Add a confirmation `Dialog` (mirror the existing expense-delete dialog pattern at :613) before calling `handleSettle()`.

---

### [x] 5. Components defined inside render → remount every render
**Status:** DONE (commit pending). Hoisted PotCard/ExpenseRow to module scope.
**Severity:** Medium (perf/correctness)
**File:** `src/app/(app)/ledger/ledger-client.tsx` — `PotCard` (:370), `ExpenseRow` (:413)

**The problem:** Both are declared inside `LedgerClient` and rendered as JSX (`<PotCard/>`, `<ExpenseRow/>`). New function identity each render → React sees a new component type → **unmounts/remounts the whole subtree every render** (wasted reconciliation, broken transitions). This is the same class of bug already fixed in the vault (`PriceInput`/`OgCard`/`OwnerButtons` were hoisted).
- Note: `renderSheets()` (:451) is *called* (`{renderSheets()}`), not mounted as `<RenderSheets/>`, so it's fine — but it's inconsistent/confusing.

**Fix:** Hoist `PotCard` and `ExpenseRow` to module scope; pass `me`, `myName`, `partnerName`, `myAccent`, `partnerAccent`, `resolveOwner`, and the relevant setters/handlers as props.

---

### [x] 6. Currency inconsistency — expenses hardcoded £, pots multi-currency
**Status:** ✅ DONE & APPLIED (2026-06-01). `couples.currency` column + `update_couple_currency` RPC live in the DB. Currency flows via CoupleContext; ledger expenses + new pots use it; selector in profile couple card.
**Severity:** Medium
**Files:** `src/app/(app)/ledger/ledger-client.tsx` — `£` literals at :438, :443, :711, :761, :771, :828 etc.; pots use `pot.currency` (£/$/€).

**The problem:** A non-UK couple sees pots in € but expenses always in £.

**Fix (decision needed):** Either (a) add the same currency selector to expenses, or (b) store a couple-level default currency and use it everywhere. Recommend (b) — a `couples.currency` column + use across expenses and as the default for new pots. **Needs user decision** (adds a column/migration).

---

### [ ] 7. `created_by`/`paid_by` are client-supplied and unverified
**Status:** NOT STARTED
**Severity:** Low-Medium (intra-couple spoofing only)
**Files:** insert server actions — `src/app/(app)/ledger/actions.ts:17`, `src/app/(app)/home/actions.ts` (countdowns), `src/app/(app)/calendar/actions.ts` (events), `src/app/(app)/vault/actions.ts`.

**The problem:** Insert actions trust the client to set authorship. RLS only checks `is_couple_member(couple_id)`, so a user can forge an expense/item *as their partner* within their own couple. Low severity (can't cross couples).

**Fix:** Set `created_by = auth.uid()` server-side (or via a DB column default `default auth.uid()`), not from the payload. Tie this into item 1's auth hardening.

---

## 🟡 LOW (Correctness / polish)

### [x] 8. Mood push notification is dead code
**Status:** DONE (commit pending). Pass coupleId at call site.
**File:** `src/app/(app)/home/actions.ts:6` (`setMood`) + caller `src/app/(app)/home/dashboard-client.tsx:242`
**Problem:** `setMood` only notifies the partner `if (coupleId)`, but the caller passes `setMood(me.id, mood)` with no `coupleId`. So the "your partner updated their mood" push never fires.
**Fix:** Pass `coupleId` at the call site (`setMood(me.id, mood, coupleId)`), or remove the dead branch. Recommend wiring it up (the feature is desired).

### [x] 9. Service Worker bugs
**Status:** DONE (commit pending). Versioned cache (us-v2), guarded cache.put (ok+basic, exclude /api & /auth), fixed notificationclick to match origin + navigate.
**File:** `public/sw.js`
- **(a)** `notificationclick` compares `client.url === "/"` — windows are `/home`, `/ledger` etc., so an existing tab is never focused; always `openWindow`. Fix: match on origin/pathname prefix.
- **(b)** Network-first caches **every GET with no `res.ok` check** → caches 404s/500s/opaque responses (poisons cache). Fix: `if (res.ok && res.type === 'basic')` before `cache.put`. Also exclude `/api/*` and auth routes.
- **(c)** No offline fallback page — cold load with no network shows the browser error. Add a cached `/offline` shell.
- **(d)** `CACHE = "us-v1"` never bumped, so activate-cleanup never triggers. Version it per deploy.

### [x] 10. Wordmark inconsistency (`us.` vs `aspaceforus.`)
**Status:** BY DESIGN (user decision). Both are intentional: `aspaceforus` = full name, `us.` = short name + logo, used where best suited. No change.
**Files:** login `src/app/auth/login/page.tsx:64` (`us.`), home banner `src/app/(app)/home/dashboard-client.tsx:318` (`us.`), metadata `src/app/layout.tsx:24,31` (`us.`), onboarding leads with `aspaceforus.`, manifest is `aspaceforus`.
**Problem:** Brand is split between `us.` and `aspaceforus.`.
**Fix (decision needed):** Pick one wordmark and apply everywhere (login, banner, metadata title, appleWebApp title). **Needs user decision** on which wins.

### [ ] 11. Redundant home-page fetches
**Status:** NOT STARTED
**File:** `src/app/(app)/home/dashboard-client.tsx:144-145`
**Problem:** The `(app)` layout already loads `get_session_data` (me + partner) into `useCouple()`, but the dashboard re-fetches `get_my_profile` AND `get_partner_profile` on mount — two extra round-trips for data already in context.
**Fix:** Use `useCouple()` for identity/avatar; keep only the realtime channel for live mood. Reduces home load cost.

### [ ] 12. Home page makes 9 queries to render one "partner's last action" line
**Status:** NOT STARTED
**File:** `src/app/(app)/home/dashboard-client.tsx:139` (Promise.all of 9), candidates logic :164-175
**Problem:** 4 of the 9 queries (latest event/vault/ledger/availability) exist only to compute "partner's most recent action" text. Lots of payload for one line.
**Fix:** A single `get_recent_partner_activity` RPC, or reuse the `activity_at` jsonb you already maintain on `profiles`.

### [ ] 13. Full-dataset cache write on every change
**Status:** NOT STARTED
**File:** `src/app/(app)/home/dashboard-client.tsx:124`
**Problem:** Effect serializes the whole dashboard to sessionStorage on every `data` change (incl. each note keystroke). Wasteful; can hit quota with large data.
**Fix:** Throttle cache writes, or persist only on unmount/visibilitychange.

### [ ] 14. Realtime channel re-subscribes on partner identity change
**Status:** NOT STARTED
**File:** `src/app/(app)/home/dashboard-client.tsx:236` (deps include `partner`)
**Problem:** Channel tears down/re-subscribes whenever `partner` object identity changes → subscribe churn.
**Fix:** Key the channel effect on `coupleId`/`me.id` only.

### [x] 15. Calendar: can't mark yourself free on an event day
**Status:** BY DESIGN (user decision: keep separate). Event days stay non-interactive for availability. No change.
**File:** `src/app/(app)/calendar/calendar-client.tsx:300` (`onClick={() => !isPast && !isEventDay && handleDay(ds)}`)
**Problem:** A day that has an event is non-interactive for availability — surprising for "we have dinner but I'm free after."
**Fix (decision needed):** Separate the event band from the availability tap, or allow availability toggle on event days too. **Needs user decision** on interaction model.

---

## 🎨 DESIGN SYSTEM

### [x] 16. Dead dark-mode code → IMPLEMENTED dark mode
**Status:** DONE (commit pending). DECISION: implement (not strip). Full `.dark` oklch token block; `.card`/`.card-row` → `bg-card`; global `bg-white`→`bg-card` (no-op in light); `.glass`/`.glass-oat` dark overrides; `cardOmbre`/owner tiles/folder panels now use `color-mix(... var(--card))` so accent washes adapt; calendar event band → `--event-band` token; no-flash inline script in layout `<head>`; `ThemeToggle` (auto/light/dark) added to profile; dynamic `theme-color` meta. Post-it kept as intentional cream "paper". ⚠️ NEEDS DEVICE QA — verify accent washes / small chips (e.g. vault "planned" bg-blue-50) look right in dark; tune token lightness if needed.
**Files:** `src/app/globals.css:5` (`@custom-variant dark`), `src/components/ui/button.tsx:13` (many `dark:` classes), `input.tsx:12`.
**Problem:** No dark theme exists and `themeColor` is hardcoded light, but dozens of `dark:` classes + the dark variant imply a feature you don't have.
**Fix (decision needed):** Either implement `prefers-color-scheme` dark mode, or strip the dead `dark:` classes. **Needs user decision.**

### [ ] 17. Default Button height below touch target
**Status:** NOT STARTED
**File:** `src/components/ui/button.tsx:23` (default size `h-8` = 32px)
**Problem:** Default is 32px, below the 44px mobile touch minimum; overridden to `h-11`/`h-12` at nearly every call site (so the default is effectively wrong for this app).
**Fix:** Change the default size to a thumb-friendly height (e.g. `h-11`) so call sites stop fighting it. (Audit call sites that rely on small variants first.)

### [ ] 18. Two component libraries + hardcoded hex
**Status:** NOT STARTED
**Problem:** Importing from `@base-ui/react` (button/input) + custom primitives + `shadcn/tailwind.css`. Also hardcoded hex outside the token system: `#E4DFD4` (calendar event band, `calendar-client.tsx`), `#FBF7E4`/`#EFE2B8` (post-it, `dashboard-client.tsx:449,453`), `#2C2C2B` (QR fg), SHARED_A/B lilacs (`owner-identity.ts:20-21`).
**Fix:** Lower priority — consolidate primitives over time; move hardcoded hex into CSS tokens so palette changes propagate.

---

## ♿ ACCESSIBILITY (weakest dimension, easy wins)

### [~] 19. Accessibility pass
**Status:** PARTIAL DONE (commit pending). Done: FAB disabled+aria-disabled when no action; mood buttons aria-label+aria-pressed; calendar month arrows aria-label; calendar day cells aria-label (date + free/event state) + aria-pressed; ledger tabs/paidBy/recurrence/contribMode aria-pressed. STILL TODO: category chips + emoji pickers (vault/ledger/home countdown) aria-labels; ledger currency/folder toggles aria-pressed; vault owner buttons; role=tablist semantics; hidden date-input AT review.
**Severity:** Low-Med, high value
- **Emoji/icon-only buttons have no labels** — mood buttons (`dashboard-client.tsx:379`), category chips, emoji pickers, calendar arrows. SR announces "button" with no name. Add `aria-label`.
- **Custom toggles aren't semantic** — paid-by / split tabs / ledger tabs are `<button>`s styled as segmented controls; lack `role="tab"`/`aria-selected` or `aria-pressed`. Add ARIA state.
- **FAB clickable when disabled** — `bottom-nav.tsx:38`, `opacity-40` when no action but still focusable/clickable (no-op). Add `disabled`/`aria-disabled` when `!action`.
- **Color as sole signal** — calendar free-day dots (owner accent only). Ledger balance does this right (+/− and text). Add glyph/text where color is the only cue.
- **Hidden native date inputs** over styled `<p>` (`dashboard-client.tsx:600`) — works by pointer but can confuse AT.

---

## 🟢 WHAT'S EXCELLENT (don't regress these)

- Optimistic-update + L1 memory / L2 sessionStorage cache (`src/lib/data-cache.ts`) + realtime broadcast — instant interactions that survive navigation.
- Server-side OAuth code exchange (`src/app/auth/callback/route.ts`) — dodges the session-cookie race correctly.
- Split FAB context (`src/contexts/fab-context.tsx`) — avoids re-render storms (learned from the infinite-loop bug).
- `CropModal` (`profile-client.tsx`) — ref-based pinch/drag avoiding stale closures, proper canvas export. Production-quality.
- Creator-scoped mutations (`.eq("created_by", userId)`) on edit/delete — good instinct (enforce in DB too, item 1/7).
- Visual craft: ombre owner-identity cards, pillar animations, post-it shadow. Looks premium.

---

## PRIORITIZED ACTION ORDER

1. 🔴 **Item 1** — Harden security-definer RPCs (auth.uid + search_path). ~30 min. **DO FIRST.**
2. 🔴 **Item 2** — Get real schema into the repo. ~1 hr.
3. 🟠 **Item 3** — Fix `useScrollLock` (body lock). ~5 min.
4. 🟠 **Item 4** — Confirm dialog on settle-up. ~15 min.
5. 🟠 **Item 5** — Hoist `PotCard`/`ExpenseRow`. ~20 min.
6. 🟠 **Item 6** — Currency consistency. ~30 min (needs decision).
7. 🟡 **Item 8** — Mood-push dead code. ~10 min.
8. 🟡 **Item 9** — SW fixes. ~20 min.
9. 🟡 **Item 10** — Unify wordmark. ~15 min (needs decision).
10. 🟡 **Item 19** — Accessibility pass. ~1-2 hr.
11. 🟡 **Item 16/17** — Dark-mode/Button default. ~30 min (needs decision).
12. Remaining (7, 11, 12, 13, 14, 15, 18) — polish/perf as time allows.

**Items needing a user decision before acting:** 6 (currency model), 10 (which wordmark), 15 (calendar interaction), 16 (dark mode yes/no). Also confirm Pattern A vs B for item 1 (recommend B — assert, preserves signatures).

---

## ONBOARDING POLISH (2026-06-02, user-reported)

### [x] 22. Onboarding fixes
**Status:** DONE (commit pending). (a) Scroll locked — container is now `fixed inset-0` + body overflow hidden (also kills the cheap empty bands above/below the bg). (b) Keyboard no longer covers fields on screen open — removed `autoFocus` from the name input (the existing onFocus scrollIntoView still centres it on tap). (c) Dark-mode button text fixed — `accentBtn` no longer hard-codes `text-white`; white is applied only when an accent bg is set, else the Button's theme-aware default text shows (fixes invisible "continue" on name/photo/colour). (d) Bloom/Ambient box glitch fixed — removed `scale`/opacity animation on the blurred blobs (that re-rasterises the blur into a hard box); now translate-only + `willChange/translateZ`. (e) Completion loop — post-onboarding nav uses `window.location.replace` (onboarding no longer in history; back-nav was bouncing through /onboarding) and handleFinish always navigates even if the optional start-date save fails. ⚠️ If the loop persists it's a server-side couple_id issue — would need logs.

---

## 🔴 ITEMS DISCOVERED DURING THE LIVE-SCHEMA CAPTURE (2026-06-02)

### [ ] 21. Push functions broke — fixed in `push_fix.sql` (⚠️ run it)
**Status:** CODE DONE — ⚠️ USER MUST RUN `supabase/push_fix.sql`. The item-1 hardening patch reconstructed `save_push_subscription` (3-arg jsonb) and `get_partner_push_subscription` to read/write a `profiles.push_subscription` column that DOESN'T EXIST (push data lives in the `push_subscriptions` table: `user_id, endpoint, p256dh, auth`). plpgsql doesn't validate column refs until runtime, so they were created OK but fail when push runs. `push_fix.sql` re-implements both against the real table (still hardened). `security_hardening.sql` updated to point at it. Until run, push notifications are broken.

### [ ] 20. ~20 legacy security-definer functions are unhardened (unused by app)
**Status:** NOT STARTED (logged). The live DB has many `security definer` functions the app never calls (it drives that CRUD through direct `.from().insert/update/delete` + RLS): `add_countdown, add_event, add_ledger_entry, add_savings_pot, add_vault_item(x2), contribute_to_pot, delete_countdown, delete_event, delete_savings_pot, delete_vault_item, settle_all, update_vault_item(x2), update_vault_stage, update_my_role, my_couple_id`, and the old 4-arg `save_push_subscription`. Most lack an `auth.uid()` guard; some (e.g. `delete_*`, `settle_all`, `contribute_to_pot`, `update_my_role`) only filter by couple_id. Risk is LOW (unreachable from UI; couple ids are unguessable UUIDs) but it's loose. RECOMMEND: `drop function` the unused ones (cleanest) — verify against `grep -rho 'rpc("[a-z_]*"' src` first (current live RPC list is in the 2026-06-02 progress note). Also legacy unused TABLES: `expenses, mood_checkins, mood_reveal, notes, tasks`.

---

## PROGRESS LOG
<!-- Append: date · item# · what changed · commit -->
- 2026-06-01 · Review authored & saved.
- 2026-06-01 · Items 1,3,4,5,6,8,9,16,19 done; 10,15 by-design. SQL (security_hardening.sql) applied to live DB.
- 2026-06-02 · Live schema captured → item 2 done. Found + fixed push regression (item 21, push_fix.sql). Logged legacy-RPC cleanup (item 20).
- 2026-06-02 · RPCs the app actually calls (keep these): get_my_profile, get_session_data, get_partner_profile, save_push_subscription(3-arg), get_partner_push_subscription, set_availability, update_my_accent_color, update_my_display_name, update_my_avatar, update_my_mood, update_shared_note, update_couple_banner, update_couple_started_at, update_couple_currency, create_couple_for_user, join_couple_for_user, leave_couple_for_user, mark_section_activity.
