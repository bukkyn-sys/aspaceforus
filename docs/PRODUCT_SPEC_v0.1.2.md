# aspaceforus — Product Spec Document (PSD)

| | |
|---|---|
| **Product** | aspaceforus (in‑app wordmark: **"us."**) |
| **Version** | **0.1.2** (first private beta) |
| **Status** | Beta‑ready; invite‑only |
| **Document owner** | Bukky (bukkyn@gmail.com) |
| **Last updated** | 2026‑06‑03 |
| **Platforms** | Installable PWA (iOS/Android/desktop), mobile‑first |
| **Production** | https://www.aspaceforus.app (apex `aspaceforus.app` redirects → www) |
| **Repo** | github.com/bukkyn-sys/aspaceforus |

---

## 1. Executive summary

**aspaceforus** is a private, installable web app (PWA) that gives a couple one calm, shared home for the everyday of being together — moods, plans, free time, money, and the little things they're saving up to do. It is deliberately the **anti‑social‑media** product: no feed, no likes, no audience, no ads. Just the two of you.

The product blends **light organization** (a shared calendar, an expense ledger, savings pots, a vault of date‑ideas and wishlists, countdowns to things you're looking forward to) with **gentle connection** (daily mood check‑ins, a shared sticky note, presence cues, and a partner‑activity feed) inside a soft, premium, intentionally quiet interface.

v0.1 is feature‑complete for a first beta: authentication (Google OAuth + passwordless email one‑time‑code, the latter added v0.1.2), couple pairing, all five core surfaces (Home, Calendar, Vault, Ledger, Profile), realtime sync between partners, web‑push notifications (partner activity + scheduled re‑engagement), dark mode, and a hardened security posture.

---

## 2. Vision, mission & positioning

- **Vision.** Every couple has a quiet, private place that is *theirs* — somewhere that makes the logistics of a shared life feel light and the connection feel intentional, without performing any of it for anyone else.
- **Mission (v0.1).** Give two people a single, beautiful, trustworthy home for their shared day‑to‑day, and make opening it feel like a small moment of warmth rather than a chore.
- **Positioning.** *A calm, private shared home for the two of you.* Organization and connection are blended, not separated. The emotional register is **soft, premium, unhurried** — closer to a well‑designed journal than a productivity tool or a dating app.
- **One‑liner.** "aspaceforus — just the two of you."
- **Tagline.** *just the two of you.*

### What it is / what it is not
| It **is** | It is **not** |
|---|---|
| Private (two people, no one else) | A social network / feed |
| Calm, ad‑free, no metrics shown to users | A gamified streak machine |
| Organization **and** connection in one | A single‑purpose utility (calendar‑only, etc.) |
| Installable, app‑like, offline‑aware | A heavy native app |
| Opinionated, soft, premium aesthetic | Neutral/corporate productivity UI |

---

## 3. Target audience & personas

**Primary audience (v0.1 / beta):** *any committed couple* — dating, long‑distance, engaged, married, cohabiting or not. The product does not assume cohabitation or shared finances; those features are opt‑in by use.

**Constraint:** a "space" is **exactly two people** (hard cap in v0.1; intentionally adjustable later).

### Personas
- **The Coordinators** — busy couple juggling two calendars; value "free days together," countdowns, and shared expenses. Pull: *organization*.
- **The Long‑distance Pair** — apart most of the time; value mood check‑ins, the shared note, presence/activity cues, and countdowns to visits. Pull: *connection + planning*.
- **The Nesters** — living together; value the ledger, savings pots, and the vault (wishlists, date ideas). Pull: *shared life admin made warm*.

All three are served by the same surface; the app lets a couple use as much or as little as fits them (every card has a graceful empty state).

---

## 4. Goals & non‑goals (v0.1)

### Goals
1. Two people can sign in, pair into a private space, and start using it in **under 2 minutes**.
2. Every core surface works, syncs **in realtime** between partners, and is **safe** (no couple can ever see another couple's data).
3. The app **feels** premium and calm: fast, animated, dark‑mode‑aware, app‑like when installed.
4. Gentle re‑engagement without nagging (partner‑activity nudges + a few friendly scheduled prompts).

### Non‑goals (explicitly out of scope for v0.1)
- Groups larger than two; multiple spaces per user simultaneously.
- In‑app messaging / chat.
- Native iOS/Android apps (PWA only).
- Monetization, payments, subscriptions.
- Email/password auth and clickable magic‑links (v0.1.2 adds passwordless **email one‑time‑code** sign‑in alongside Google; classic password login and magic‑links remain out of scope).
- Two‑way external calendar sync, bank/expense imports.
- Analytics dashboards / admin tooling.

---

## 5. Success metrics (proposed)

Business model for v0.1 is **free; monetization deferred** — so success is measured in **engagement, retention, and "both‑partners‑active"**, not revenue.

| Metric | Why it matters | Target (beta, directional) |
|---|---|---|
| **Couple activation** (both partners paired + each took ≥1 action) | The product only works as a pair | ≥ 70% of created spaces |
| **D1 / D7 / D30 couple retention** | Calm daily habit | D7 ≥ 40%, D30 ≥ 25% |
| **Both‑active rate** (both partners active in a 7‑day window) | Connection, not solo use | ≥ 50% of active couples |
| **Notification opt‑in** | Re‑engagement channel health | ≥ 50% of users |
| **Feature adoption breadth** (avg # of the 5 surfaces used/couple) | Blended value | ≥ 3 |
| **Mood check‑in frequency** | Lightweight daily ritual | ≥ 3×/week among active users |
| **Crash/error rate** | Trust | < 0.5% of sessions |

> *Note:* as of **v0.1.1**, PostHog instruments the named product events and Sentry captures errors (see §16), so these metrics are now measurable — the PostHog dashboards/funnels still need building.

---

## 6. Product principles

1. **Two, and only two.** Every model, query, and policy is scoped to one couple. Privacy is the feature.
2. **Calm over loud.** No badges screaming, no streaks shaming, no red dots everywhere. Soft colour, generous space, quiet motion.
3. **Optimistic & instant.** Actions reflect immediately; the network catches up. Cached data renders first; the screen never blocks on a spinner where it can avoid it.
4. **Both people are first‑class.** Owner identity (whose thing this is) is expressed consistently via accent colour + avatars across every surface.
5. **Graceful everywhere.** Every list has an empty state; every screen has a loading and error state; offline is surfaced honestly.
6. **Installable, app‑like.** Splash, sticky headers, page transitions, safe‑area awareness, home‑screen icon.

---

## 7. Information architecture & navigation

**Auth gate** → **Onboarding** (if no couple) → **App shell** (if paired).

The app shell is a fixed **bottom tab bar** with a centre **+ (FAB)** whose action is contextual to the current tab:

```
┌──────────────────────────────────────────┐
│  (screen content, fade page transition)  │
│                                          │
├──────────────────────────────────────────┤
│  Home   Calendar   (+)   Vault   Ledger  │  ← fixed bottom nav, glass
└──────────────────────────────────────────┘
        Profile is reached from the Home header avatar.
```

- **Home** (`/home`) — the dashboard / daily glance.
- **Calendar** (`/calendar`) — availability overlap + events + countdowns.
- **+ FAB** — add the primary object for the current tab (countdown on Home, event on Calendar, vault item/folder on Vault, expense/pot on Ledger).
- **Vault** (`/vault`) — folders → items (date ideas, wishlists, general).
- **Ledger** (`/ledger`) — expenses + savings pots.
- **Profile** (`/profile`) — settings, accessed via the avatar in the Home header (not a tab).

Notification badges (a single soft dot) appear on a tab when the partner has acted in that section since you last viewed it.

---

## 8. Feature specifications

> Each feature lists: purpose, behaviour, data, realtime, ownership/permissions, edge cases.

### 8.1 Authentication
Two passwordless methods, offered by context:
- **Google OAuth** (Supabase Auth, PKCE). Server‑side code exchange at `/auth/callback` writes session cookies before redirect (prevents a session race that bounced users back to login). Shown in full browsers and the installed PWA.
- **Email one‑time code** (added v0.1.2). The user enters their email, Supabase emails a numeric code (`signInWithOtp`), and they type it back on the same page; `verifyOtp` runs client‑side, then a full navigation to `/home` carries the fresh session cookies to the server (which routes new users on to onboarding). Verify tries `type: "email"` then falls back to `type: "signup"` so both returning and brand‑new users confirm with one code; the field accepts up to an 8‑digit code (project‑configurable length). A resend cooldown (40 s) matches Supabase's per‑user minimum interval.
- **Availability by context.** Email‑code sign‑in is shown in **every** browser, so an account created with email is always reachable on any device. Google is shown **only where it can work** (real browsers) — inside in‑app browsers (Instagram, TikTok, WhatsApp, Snapchat, etc.) Google OAuth is blocked, so that path is hidden and replaced with the email‑code form plus a hint (and copy‑link) to open the page in Safari/Chrome if the user prefers Google.
- **Why email code, not magic‑link.** A typed code completes in the same window, so it works inside in‑app browsers with no browser hop; a clickable magic‑link opened from an email app in a *different* browser breaks PKCE. (A `token_hash` magic‑link + `/auth/confirm` route was prototyped and dropped in favour of the code.)
- **Sending.** Auth emails are delivered through **Resend** via custom SMTP configured in Supabase (sender `admin@aspaceforus.app`); the throttled, spam‑prone built‑in Supabase mailer is no longer used. Supabase email templates ("Magic link or OTP", "Confirm signup") emit the code via `{{ .Token }}`.
- **Sign out:** Profile → sign out (clears session, returns to login).
- **Edge:** a missing `profiles` row is self‑healing — the `handle_new_user` trigger and the couple RPCs upsert it so onboarding can't get stuck.
- **Known gap:** same‑email identity linking (a person using Google on one device and the email code on another with the same address being treated as **one** account) is not yet confirmed in Supabase settings — to verify before public launch.

### 8.2 Onboarding & couple pairing
A staged, animated flow (`/onboarding`), shown when a signed‑in user has no `couple_id`:
1. **Install** (add to home screen) → **Welcome** ("hello, {name}." — the one place the full name "aspaceforus." appears, dissolving into "us.") → **Pillars** tour → **Name** → **Photo** (optional, croppable) → **Colour** (accent pick) → **Couple** → **Finish**.
2. **Couple step** has two tabs:
   - **Create** → `create_couple_for_user` mints a couple + 8‑char invite code; user lands on **Finish** with a QR + code to share.
   - **Join with code** → enter the partner's 8‑char code; `join_couple_for_user` links them (validates, enforces the 2‑person cap, rate‑limits attempts).
3. **Finish** (create path) → optional "when did you get together?" date + the invite QR/code, then into the app.
- **Invite QR deep‑link:** scanning opens `/join?code=…`, which stashes the code in a short‑lived cookie that survives sign‑in, then pre‑fills the join field.
- **Permissions/cap:** a space is capped at 2; a third join attempt returns `full` → "that space already has two people in it."

### 8.3 Home (dashboard)
The daily glance. Sticky **banner** header (couple photo or gradient + "us." wordmark, floats in on navigation) over a stack of cards:

- **Greeting + partner‑activity line** — "good morning / {your name}." and, if applicable, "{partner} {did X} · {time ago}" (most‑recent partner action across calendar/vault/ledger/mood). Avatar (→ Profile) top‑right.
- **Relationship duration** — "X years, Y months" since `started_at` (tap to set/edit via a confirm‑to‑save date picker).
- **Mood card** — both partners' current mood on a 5‑point emoji scale (😞→😄). You set yours (optimistic + broadcast); partner's is read‑only and live. Shows "time ago" per mood. If unpaired, shows the invite code to share.
- **Shared note** — a post‑it textarea, debounced‑saved, live to both. Guarded so an incoming realtime update never clobbers what you're actively typing.
- **Countdowns ("coming up")** — upcoming dated things with an emoji and a day count; **"today" / "tmrw"** replace 0/1‑day counts; auto‑deleted the day after they fully end (respects multi‑day `end_date`). Either partner can edit/delete.
- **Next free days** — up to 3 upcoming dates where *both* marked themselves free (next 60 days), each with a **plan** button that opens a countdown pre‑dated to that day (and clears that "free" mark).
- **Accounts** — settlement snapshot ("all settled up" or "{X} owes {Y} £N") + a horizontal scroll of savings pots with progress bars (→ Ledger).
- **Realtime:** moods (broadcast), shared note/started_at (`couples` changes), partner join (`profiles`), and a debounced reload on partner changes to availability/events/countdowns/ledger/pots — skipping your own inserts.

### 8.4 Calendar
- **Availability overlap.** Tap a day to toggle **yourself "free"** (single state — "busy" was removed). Each day cell shows two dots (you + partner) in accent colours; days where **both** are free get a highlighted "free together" cell. Header shows "{N} free days together this month."
- **Events.** Dated items with emoji, optional end date (multi‑day range rendered as a contiguous band across the grid). Shown in an "events this month" list below the grid. **Both partners can edit/delete any event** (shared calendar).
- **Countdowns** also surface here (shared; co‑editable), with "today"/"tmrw"/day‑count.
- **Collision handling.** Multiple items starting on one day show a count badge; multi‑day ranges round their corners correctly at week boundaries.
- **Constraint (known):** a day that already has an event/countdown can't also be toggled for availability (intentional, flagged as a future UX consideration).
- **Realtime:** live updates from partner changes to availability/events/countdowns (own inserts skipped to avoid redundant refetch).

### 8.5 Vault
A two‑level store of the couple's ideas and wants.
- **Folders view.** Default folders **date ideas** and **wishlist** are seeded for new couples; couples can add **general** folders (custom name + emoji). Each folder card shows a bare emoji, name, item count, and a saturated colour gradient (kind‑based for defaults, rotating palette for general). Folders are couple‑scoped; default folders can't be deleted.
- **Items view.** Each item has: title, optional owner (you / partner / **shared**), optional URL (sanitized to http/https only — blocks `javascript:`/`data:`), notes, price range, an emoji, an optional **uploaded photo**, and a **stage** for date ideas (idea → planned → done).
  - **Filtering** by owner (all / shared / {you} / {partner}); **sorting** (newest/oldest/A–Z/Z–A/price low‑hi/hi‑low) via an icon menu in the title row.
  - **Ownership rule:** items are **creator‑editable only** (your partner's items are read‑only to you; tapping a non‑yours item with a link opens the link).
  - Owner identity reads via the card's accent edge + avatars; emojis are bare (no tile).
- **Photos** are uploaded to private storage and rendered via signed URLs.
- **Realtime:** live folder/item changes (own inserts skipped).

### 8.6 Ledger
Money, kept light and fair.
- **Expenses.** Title, amount, **paid by** (you/partner), **split** (% slider, default 50/50), optional category (emoji‑tagged), and **recurrence** (one‑off / weekly / monthly). Each row shows who paid, the amount, and *your share*; colour‑coded sage (they owe you) / terracotta (you owe). **Creator‑editable only.**
- **Net balance** computed from unsettled expenses → surfaced here and on Home.
- **Settle up.** Clears all **one‑off** unsettled expenses (recurring persist as ongoing splits), stamping a shared `settled_at` so a settle batch groups into one "receipt" in **history**. Confirm‑gated; irreversible.
- **Savings pots.** Title, emoji, goal, currency, optional target date; tracks each partner's contribution (his/hers = creator/non‑creator). Add/withdraw contributions; progress bar + pace ("£X/wk to reach by …"). Pots live in **pot folders** (default "savings" seeded).
- **Failure surfacing:** the money‑critical writes (add expense, settle, contribute) catch transport failures → toast "couldn't save — check your connection" + reload to restore truth.
- **Realtime:** live entry/pot changes (own inserts skipped).

### 8.7 Profile & settings
- **Avatar** (croppable, private, signed URL) and **couple banner** (croppable, sets the Home banner; position adjustable at upload time).
- **Display name**, **accent colour** (6 options; partner's taken colour is shown), **currency** (£/$/€, couple‑level default for expenses & pots).
- **Invite code + QR** (to add a partner if unpaired / re‑share).
- **Appearance** — light / dark / system theme toggle (no‑flash, applied before first paint).
- **Notifications** — explicit enable (never auto‑prompts); shows granted/blocked/unsupported states with guidance.
- **Leave couple** — unlinks you (partner keeps the space + data); confirm‑gated. On leave (v0.1.1), your **vault items and events are reassigned to your partner** so nothing is orphaned; ledger entries keep their creator (the partner can still settle them).
- **Sign out.**

### 8.8 Notifications
Two distinct systems over the same Web Push channel (see §13):
1. **Partner‑activity nudges** — when you add an expense, vault item, event, or update your mood, your partner gets a push ("your partner logged …"). **Throttled to ≤1 per recipient per 10 minutes** to prevent bursts.
2. **Engagement nudges** — a scheduled cron sends a **randomly chosen, friendly, deep‑linked prompt** (18 variants) **4×/day during UK daytime**, skipping anyone notified in the last **3 hours** (reuses the same throttle column so it never piles onto active users).

### 8.9 PWA / install
- Installable with a maskable icon; **home‑screen name "aspaceforus"** paired with the **"us." app icon**.
- **Cold‑start splash** (background + "us." wordmark) dissolves into Home.
- **Service worker** caches **static build assets only** (never authenticated HTML/RSC — privacy + freshness).
- **Pull‑to‑refresh** (at top of page) refetches the current screen's data.
- Safe‑area aware; sticky headers; offline banner.

---

## 9. Key user flows

1. **First run (creator).** Login (Google) → onboarding → create space → share code/QR → use app.
2. **First run (joiner).** (Optionally scan QR →) login → onboarding → join with code → straight into Home.
3. **Daily loop.** Open app (splash) → Home glance (moods, note, what's coming up, free days, balance) → tap into a surface to add/adjust → partner sees it live + gets a (throttled) nudge.
4. **Plan a date.** Home "next free days" → **plan** → countdown pre‑dated → appears on Home + Calendar; the free‑day mark clears.
5. **Square up money.** Ledger → add expenses over time → **settle up** → grouped receipt in history.
6. **Leave / re‑pair.** Profile → leave couple → onboarding → create/join again.

---

## 10. Design system

- **Aesthetic:** "Neutral Wellness" — warm off‑white/oat light mode, soft charcoal dark mode, generous radii, quiet shadows. Premium, journal‑like.
- **Colour:** OKLCH design tokens with semantic roles (`background`, `card`, `muted`, `sage`, `terracotta`, `event-band`, etc.) and **wash‑strength tokens** that adapt accent intensity per mode. Full **dark mode**.
- **Accent system:** 6 personal accents (sage, terracotta, sky, amber, lavender, rose). Each person picks one; it colour‑codes *their* things everywhere.
- **Owner identity:** a shared helper renders ownership consistently — a curved right‑edge accent stroke on personal cards, a neutral wash + paired avatars for shared items, and `OwnerAvatars` (one circle, or two overlapped for shared).
- **Typography:** Instrument Serif (headings/wordmark, lowercase "us." aesthetic), Plus Jakarta Sans (body), Geist Mono (codes/numbers).
- **Motion (framer‑motion + CSS):** cold‑start splash; **page transitions** (cross‑fade the page, header floats down) via a frozen‑router `AnimatePresence`; bottom‑sheet slide‑up; dialog scale‑in; pull‑to‑refresh; respects `prefers-reduced-motion` for movement.
- **Components:** `BottomSheet`/`Dialog` (portaled to `<body>`, animated), `DateField` (styled box + transparent native input — consistent cross‑platform date UI), `SignedImg`, `OwnerAvatars`, `SkeletonRows`, `Toaster`, `OfflineBanner`, sticky headers with scroll‑aware separators, contextual FAB.
- **Voice/microcopy:** lowercase, warm, unhurried ("nothing to look forward to yet", "just the two of you", "completely private").

---

## 11. Technical architecture

- **Framework:** Next.js 16 (App Router, Turbopack), React, TypeScript.
- **Styling:** Tailwind v4 + custom token layer; shadcn/base‑ui primitives.
- **Backend:** Supabase — Postgres (+ Row‑Level Security), Auth (Google OAuth + email one‑time‑code), Storage (private buckets), Realtime (postgres_changes + broadcast).
- **Hosting:** Vercel (Hobby), Git‑integration deploys from `main` + CLI deploys; production aliased to www.aspaceforus.app.
- **Email:** transactional/auth email via **Resend** (custom SMTP set in Supabase Auth; domain `aspaceforus.app` verified with SPF/DKIM on the `send` subdomain). Inbound mail to the domain (`team@`/`admin@aspaceforus.app`) is forwarded to the owner's inbox via **ImprovMX** (MX + SPF on the root) — the two record sets live on different names so they don't collide. All DNS is managed in Vercel.
- **Push:** `web-push` (VAPID) from server actions + a cron API route.
- **Scheduling:** GitHub Actions cron (Vercel Hobby cron is once/day‑limited) → authenticated `/api/cron/engagement`.
- **Observability (v0.1.1):** PostHog (product analytics, scoped to the authenticated app) + Sentry (errors/traces, server/client/edge). Both no‑op safely if unconfigured.

### Rendering & data flow
- **Server components** validate the session and load couple context once per app load via `get_session_data` (one RPC returns me + partner + currency). The **Home** screen loads all its data in a single `get_home_data` RPC (v0.1.1 — replaced ~11 parallel queries).
- **Client screens** load their own data with the Supabase browser client inside effects, render **cached‑first** (two‑tier cache: in‑memory + `sessionStorage`, 10‑min TTL), and reconcile via **optimistic updates** + **realtime**.
- **Realtime:** per‑screen channels subscribe to the couple's rows (`postgres_changes`, RLS‑scoped) + broadcast (mood/activity). Handlers skip the actor's own INSERT echoes to avoid redundant refetches and debounce reloads.
- **Middleware** (`proxy.ts`) refreshes the Supabase session on each request and gates routes; `/api/*`, `/auth/*`, `/`, and `/join` bypass the login redirect.
- **Offline:** service worker (static‑asset cache) + `navigator.onLine` banner; writes that fail surface a toast (money writes) and reload to truth.

---

## 12. Data model (current effective schema)

> Base schema + applied migrations. All app tables are RLS‑scoped to the couple via `is_couple_member(couple_id)`; profiles are visible within a couple. `sounding_board` exists but is **unused (dead)**.

- **couples** — `id`, `invite_code` (8‑char unique), `currency` (£/$/€), `banner_url`, `banner_focus` (int 0–100), `started_at` (date), `shared_note` (text), `created_at`.
- **profiles** — `id` (→ `auth.users`), `couple_id`, `display_name`, `avatar_url`, `accent_color`, `current_mood` (1–5), `mood_updated_at`, `activity_at` (jsonb {section→ts}), `created_at`.
- **availability** — `id`, `couple_id`, `user_id`, `date`, `status` ('free'; null = unset), `created_at`; unique(couple_id,user_id,date).
- **events** — `id`, `couple_id`, `created_by`, `title`, `start_at`, `end_at?`, `emoji`, `created_at`.
- **countdowns** — `id`, `couple_id`, `created_by`, `title`, `target_date`, `end_date?`, `emoji`, `archived`, `created_at`.
- **vault_folders** — `id`, `couple_id`, `created_by`, `name`, `emoji`, `kind` (date_idea/wishlist/general), `is_default`, `sort_order`, `created_at`.
- **vault_items** — `id`, `couple_id`, `created_by`, `folder_id`, `type`, `owner` (user_id|'shared'), `title`, `url?`, `notes?`, `price_range?`, `og_image?` (uploaded photo), `og_title?`, `item_emoji?`, `stage` (ideas/planned/completed), `created_at`, `updated_at`.
- **ledger_entries** — `id`, `couple_id`, `created_by`, `paid_by`, `title`, `amount`, `split_ratio` (0–1, your share), `category?`, `recurrence` (none/weekly/monthly), `settled`, `settled_at?`, `created_at`.
- **savings_pots** — `id`, `couple_id`, `created_by`, `folder_id`, `title`, `goal_amount`, `his_amount`, `hers_amount`, `currency`, `target_date?`, `emoji?`, `created_at`, `updated_at`.
- **pot_folders** — `id`, `couple_id`, `created_by`, `name`, `emoji`, `is_default`, `sort_order`, `created_at`.
- **push_subscriptions** — `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `last_notified_at`, `created_at`.
- **join_attempts** — `id`, `user_id`, `attempted_at` (rate‑limiting failed joins).

**Key RPCs (SECURITY DEFINER, `auth.uid()`‑guarded):** `get_session_data`, `get_my_profile`, `get_partner_profile`, `create_couple_for_user`, `join_couple_for_user` (capped + rate‑limited), `leave_couple_for_user`, `update_my_mood`/`_display_name`/`_accent_color`/`_avatar`, `update_shared_note`, `update_couple_started_at`/`_banner`/`_banner_focus`/`_currency`, `set_availability`, `mark_section_activity`, `save_push_subscription`, `get_partner_push_subscription` (throttled), `handle_new_user` (trigger).

---

## 13. Security & privacy

Privacy *is* the product, so this got a dedicated hardening pass.

- **Tenancy isolation (RLS).** Every couple table is `using (is_couple_member(couple_id))`; a user can never read/write another couple's rows. Profiles visible only within a couple.
- **IDOR closure.** All SECURITY DEFINER RPCs reject `p_user_id <> auth.uid()` and pin `search_path`. Legacy unguarded RPCs dropped.
- **Server‑side authorship.** Writes stamp `created_by` from the session (`auth.uid()`), not client input.
- **Storage privacy.** `avatars` / `banners` / `vault` buckets are **private**; images render via **signed URLs**. New vault photos are stored at `vault/<couple_id>/<user_id>/…`. Reads are broad‑authenticated (paths are unguessable UUIDs that only appear behind table‑RLS); a write‑scoping migration (`storage_scope_writes.sql`, **v2**, using the `is_couple_member()` SECURITY DEFINER helper) is prepared but **deferred** — v1's inline `profiles` sub‑query broke banner uploads, so beta runs the permissive write policy (see `SECURITY_NOTES.md`).
- **SSRF removed.** The image proxy + OG scraper (server‑side fetch of user URLs) were deleted.
- **Stored‑XSS blocked.** Vault URLs sanitized to http/https before `window.open`/`<a href>`.
- **Couple‑size cap.** Enforced in `join_couple_for_user` (returns `full`).
- **Join rate‑limiting.** Max 10 failed code guesses / 15 min / user (`join_attempts`). Invite code is 8 hex chars (~4B space).
- **Notification throttle.** ≤1 push per recipient per 10 min.
- **HTTP headers + CSP.** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, and a Content‑Security‑Policy (scoped to self + Supabase; `'unsafe-inline'` retained for Next hydration/Tailwind).
- **Auth.** Google OAuth (PKCE, server‑side code exchange) + passwordless email one‑time‑code (`verifyOtp`, client‑side). Auth email sent via Resend custom SMTP over a domain with verified SPF/DKIM; OTP sends are rate‑limited (Supabase per‑user minimum interval + hourly cap). Service‑role key is server‑only (cron route).
- **Realtime.** `postgres_changes` are RLS‑scoped. Broadcast channels (mood/activity) are keyed on the couple's UUID and currently public‑by‑topic — low practical risk (UUID never exposed to non‑members); noted for a future private‑channel pass.

**Residual / known security items:** storage *writes* still broad‑authenticated (scoping SQL ready, pending an upload‑test); broadcast channels not yet RLS‑private; no audit logging.

---

## 14. Notifications system (detail)

- **Transport:** Web Push (VAPID). Subscriptions stored per device in `push_subscriptions`; the service worker renders the notification and routes clicks to a deep link.
- **Partner activity:** server actions call `notifyPartner` → `get_partner_push_subscription` (now **throttled**: returns null if the recipient was notified < 10 min ago, else stamps `last_notified_at` and returns the subscription).
- **Engagement cron:** `/api/cron/engagement` (Node runtime) — Bearer‑auth via `CRON_SECRET`, reads subscriptions via the **service‑role key**, sends a random prompt, stamps `last_notified_at`, deletes revoked subs (404/410). Triggered by **GitHub Actions** 4×/day (10:00/13:00/16:00/19:00 UTC) at the **www** host (apex redirect drops the auth header). **Adaptive delivery (v0.1.1):** layered on the 3 h minimum, using `profiles.activity_at` recency — active <2 h → skip; <24 h → max 1/day; <7 d → max 2/day; inactive 7 d+ → max 1/day (per‑day counter on `push_subscriptions`).
- **Prompts:** 18 varied, friendly, lowercase, deep‑linked messages (mood, free days, date ideas, notes, expenses, pots, countdowns, photos, etc.).

---

## 15. Performance

- **One session RPC** per app load (me + partner + currency folded together).
- **Cached‑first rendering** (in‑memory + sessionStorage, 10‑min TTL) → instant tab revisits; **skeletons** on first‑ever visit.
- **Optimistic updates** everywhere; realtime reconciles; **own‑insert echoes skipped** to avoid redundant section refetches; home reloads are debounced.
- **Signed‑URL caching** (module‑level) so an avatar isn't re‑signed across components.
- **Service worker** caches immutable build assets (cache‑first).
- **Home is one round‑trip:** the Home screen loads via a single `get_home_data` RPC (v0.1.1 — was ~11 parallel queries).

---

## 16. Accessibility & observability

- **A11y done:** keyboard/screen‑reader‑operable card rows (role=button + Enter/Space), raised contrast floor in both themes, ARIA labels on icon buttons, reduced‑motion respected for movement.
- **A11y open:** whole‑app pinch‑zoom is disabled (product decision); the custom date display value isn't announced (the input is labelled); large single‑file screens.
- **Observability (added in v0.1.1):** **PostHog** (named product events + `identify`, no PII; scoped to the authenticated app, not /auth or /onboarding) and **Sentry** (server/client/edge; errors + 10% traces in prod, 100% in dev). Both are **safe no‑ops if their keys are unset**. PostHog dashboards/funnels still need building to read the §5 metrics.

---

## 17. Operations & deployment

- **Environments:** Vercel Production (`main` → www.aspaceforus.app), Preview, Development.
- **Env vars (Production):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (cron only), `VAPID_SUBJECT`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET`. **Observability (v0.1.1):** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, optional `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`; dev‑only `NEXT_PUBLIC_FORCE_WEBVIEW`. (Full table in `README.md`.)
- **Email infrastructure (v0.1.2):** **Resend** for transactional/auth send — SMTP host/key live in **Supabase → Auth → SMTP** (not a Vercel env var); sender `admin@aspaceforus.app`. **ImprovMX** forwards inbound `aspaceforus.app` mail to the owner's Gmail. DNS for all of it (Resend SPF/DKIM/MX on `send`, ImprovMX MX/SPF on root) is in **Vercel DNS**. Supabase email templates are customised to emit the OTP via `{{ .Token }}`.
- **Secrets (GitHub Actions):** `CRON_SECRET`.
- **DB migrations:** hand‑run SQL files in `supabase/` (no automated migration runner). Notable: `run_all.sql` (hardening), `notification_throttle.sql`, `join_rate_limit.sql`, `perf_session_currency.sql`, `storage_*` , `fix_*`.
- **Deploy:** push to `main` (Git integration) or `npx vercel --prod` (CLI bypasses the Hobby single‑slot queue). Service worker `CACHE` version is bumped per release to force client refresh.
- **Runbook notes:** installed PWA caches aggressively — a fully‑closed restart is the reliable way to pick up a new build.

---

## 18. Known limitations & tech debt

- ~~No analytics/error reporting~~ → added in v0.1.1 (PostHog + Sentry).
- ~~Auth is Google‑only (no email/magic‑link fallback)~~ → v0.1.2 adds email one‑time‑code sign‑in (every browser, incl. in‑app), covering non‑Google + WebView users; classic password login still absent, and same‑email identity linking (Google + email → one account) not yet confirmed.
- Screens are large single files (vault ~1.1k lines); repeated form/sheet blocks are extraction candidates.
- Storage writes broad‑authenticated (scoping **v2** prepared but deferred — see §13); broadcast channels not RLS‑private (both low‑risk).
- Calendar: a day with an event/countdown can't also toggle availability.
- ~~Home ~11 queries/load~~ → collapsed to one `get_home_data` RPC in v0.1.1.
- `sounding_board` dead table; legacy migration files retained for history.
- Optimistic‑failure handling is on money writes only (others rely on the offline banner).

---

## 19. Roadmap

**v0.1 (now):** five surfaces, pairing, realtime, push (activity + engagement), dark mode, hardened security, PWA.

**Near‑term (pre‑public):** ~~analytics + error reporting~~ (done, v0.1.1); ~~email/magic‑link auth fallback~~ (done, v0.1.2 — email one‑time‑code); confirm same‑email identity linking; apply storage write‑scoping **v2** (preview‑test first); broadcast‑channel RLS; first‑class feedback channel; finish optimistic‑failure coverage.

**Roadmap themes (owner‑selected):**
1. **Messaging / love notes** — in‑app exchange between partners (beyond the single shared note).
2. **Memories / photo albums** — shared timeline, milestones, "on this day."
3. **Shared lists & reminders** — todos, groceries, recurring + anniversary/automatic nudges.
4. **Calendar sync & integrations** — two‑way Google/Apple calendar; possibly expense imports.

**Later candidates:** group/multi‑member spaces (relax the 2‑cap), monetization (freemium likely), native wrappers, richer presence.

---

## 20. Decisions log (key product decisions)

| Decision | Rationale |
|---|---|
| Space capped at **2** | Core privacy model; "just the two of you." Adjustable later. |
| Avatars, banners, vault photos **private** | Privacy is the product. |
| Google OAuth as a sign‑in method | Fastest trustworthy path; one tap in real browsers. |
| Add **email one‑time‑code** (v0.1.2) | Google OAuth is blocked in social‑media in‑app browsers; a typed code signs in without leaving the app, and keeps email accounts reachable on any device. |
| Email **code** over magic‑link | A typed code completes in one window (in‑app‑browser safe); a clickable magic‑link breaks PKCE when opened in a different browser. |
| Email via **Resend SMTP** + **ImprovMX** forwarding | Built‑in Supabase mailer is throttled/spam‑prone; Resend gives deliverable send, ImprovMX gives a free inbound address for the brand. |
| **Removed** image proxy + OG scraper | SSRF risk > value. |
| Home‑screen name **"aspaceforus"**, icon **"us."** | Keep the wordplay duality (a‑space‑for‑us → us.). |
| Tagline **"just the two of you"** | Single, warm, on‑brand line. |
| Whole‑app pinch‑zoom **off** | Owner preference (prevents accidental zoom); a11y trade‑off accepted. |
| Engagement nudges **4×/day, varied, 3 h skip** | Re‑engage without nagging; repetition "looks cheap." |
| **Free** for v0.1 | Product/retention first; monetization later. |

---

## 21. Open questions

1. **Analytics/error stack** — which (PostHog? Plausible? Sentry?) and when (pre‑public)?
2. **Monetization shape** if/when — freemium tiering (storage? premium themes? advanced features?).
3. ~~**Email/magic‑link auth** — add before wider launch?~~ → done in v0.1.2 (email one‑time‑code). **Open:** confirm same‑email identity linking (Google + email → one account) before public launch.
4. **"Both free" presence beyond calendar** — surface live presence ("she's in the app now")?
5. **Group spaces** — ever relax the 2‑cap (families, etc.), or stay strictly couples?

---

## Version history

### v0.1.2 (2026‑06‑03)
Auth + email‑infrastructure increment.
- **Email one‑time‑code sign‑in** added alongside Google. The login page now
  offers Google (real browsers only) and a passwordless email code (every
  browser). Inside in‑app browsers — Instagram, TikTok, WhatsApp, etc., where
  Google OAuth is blocked — Google is hidden and the email‑code form is shown,
  plus a hint/copy‑link to open the page in a full browser for Google. Closes the
  long‑standing "Google‑only excludes WebView/non‑Google users" gap and makes an
  email account reachable on any device.
- **Verify robustness:** `verifyOtp` tries `type: "email"` then `type: "signup"`
  so returning and brand‑new users confirm with one code; the field accepts up to
  an 8‑digit code; client‑side verify then full‑navigates to `/home` so the
  session cookies reach the server.
- **A magic‑link (`token_hash`) + `/auth/confirm` prototype was built and
  removed** in favour of the same‑window code (no cross‑browser PKCE breakage).
- **Email delivery hardened:** transactional/auth email moved off Supabase's
  throttled built‑in mailer to **Resend** via custom SMTP (sender
  `admin@aspaceforus.app`; domain verified with SPF/DKIM). Supabase email
  templates emit the code via `{{ .Token }}`.
- **Inbound email:** `aspaceforus.app` mail (e.g. `team@`, `admin@`) forwards to
  the owner's inbox via **ImprovMX** (root‑domain MX/SPF; coexists with Resend's
  `send`‑subdomain records). All DNS managed in Vercel.
- No schema changes; no new Vercel env vars (SMTP credentials live in Supabase).

### v0.1.1 (2026‑06‑03)
A hardening / instrumentation increment on top of v0.1 — no new user-facing surfaces.
- **Observability:** PostHog (named product events — `mood_set`, `note_updated`,
  `event_created`, `countdown_created`, `vault_item_created`, `expense_added`,
  `pot_contributed`, `settle_up`, `couple_created`, `couple_joined` — plus
  `identify` with `couple_id`/`accent_color`, no PII) and Sentry (server/client/
  edge). Both no‑op safely when unconfigured. Closes the v0.1 observability gap.
- **Performance:** Home collapsed from ~11 parallel queries to a single
  `get_home_data` RPC (cache + realtime unchanged).
- **Engagement nudges → adaptive:** per‑user daily caps by `activity_at` recency,
  layered on the existing 3 h minimum.
- **WebView fallback:** detection now covers Line; `NEXT_PUBLIC_FORCE_WEBVIEW`
  dev simulation; `/join` coverage confirmed.
- **Storage write‑scoping:** vault uploads moved to `vault/<couple_id>/<user_id>/`;
  scoping migration rewritten to **v2** (`is_couple_member()` helper) — still
  deferred, beta runs the permissive policy (`SECURITY_NOTES.md`).
- **Leave couple:** the leaving partner's vault items + events are reassigned to
  the remaining partner (no orphans); ledger entries keep their creator.
- New env vars documented in `README.md`.

### v0.1 (2026‑06‑03)
First private beta. Five surfaces (Home, Calendar, Vault, Ledger, Profile),
Google auth + couple pairing, realtime sync, web‑push (partner activity +
scheduled engagement), dark mode, page transitions, PWA, and the C1–C5 / H1–H5 /
CSP security pass.

## Appendix A — Route map
`/` · `/auth/login` · `/auth/callback` · `/join` · `/onboarding` · `/home` · `/calendar` · `/vault` · `/ledger` · `/profile` · `/api/cron/engagement` · `/icon` · `/apple-icon` · `/manifest.json`

## Appendix B — Glossary
- **Space / couple** — the private container shared by exactly two people.
- **Owner identity** — the visual system (accent + avatars) showing whose item something is.
- **Free day** — a date a partner marked themselves available; "free together" = both did.
- **Pot** — a savings goal with per‑partner contributions.
- **Nudge** — a push notification (partner‑activity or scheduled engagement).
- **"us." / aspaceforus** — in‑app wordmark / full product + home‑screen name.
