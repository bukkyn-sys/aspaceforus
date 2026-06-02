# aspaceforus — Pre-Beta Security Plan

> **Created:** 2026-06-02 · **Status:** PLAN ONLY — nothing actioned yet. Purpose: harden the app before sending invite links to beta testers. Severity reflects "what a malicious/curious tester (an authenticated user) or a random internet visitor could do."
>
> Threat model: the app is a couples' private dashboard. Two real adversaries matter for beta: (a) **an authenticated user** poking at another couple's data via the API directly (devtools/console), and (b) **an unauthenticated internet visitor** hitting public endpoints. Beta testers are semi-trusted but invite links may be forwarded.

Tech: Next.js 14 (App Router, server actions) · Supabase (Postgres+RLS, Auth/Google OAuth, Storage, Realtime) · Vercel (Hobby) · PWA + web-push.

---

## 🔴 CRITICAL — fix before any beta link goes out

### C1. Security-definer RPC IDOR — VERIFY fully applied in production
- **Status:** Patched in repo (`security_hardening.sql`) + reportedly run. MUST CONFIRM every function in the live DB now asserts `auth.uid()`.
- **Risk if any missed:** any logged-in user reads/edits/【ejects】 any other user (full horizontal takeover). See APP_REVIEW item #1.
- **Verify:** run an introspection query and confirm every `security definer` function that takes a `p_user_id`/`p_couple_id` contains the `auth.uid()` guard. Also `update_couple_currency`, `update_couple_banner_focus` (newer).
- **Action:** verification query + spot-test from a second account via devtools.

### C2. SSRF + open proxy in `/api/img-proxy`  (`src/app/api/img-proxy/route.ts`)
- **Confirmed:** the route is **unauthenticated** (public GET) and fetches **any** user-supplied URL server-side, validating only the protocol (`http/https`) — **no host validation**.
- **Risk:**
  - **SSRF:** `?src=http://169.254.169.254/latest/meta-data/...`, `http://localhost:PORT`, `http://10.0.0.0/...`, internal services — the server makes the request. Even with the `content-type` image check, the request still *fires* (port-scan/probe internal infra; some metadata endpoints return image-ish content).
  - **Open image proxy:** anyone on the internet can route arbitrary image traffic through your domain (bandwidth/abuse, and your domain becomes a laundering proxy for tracking/malware images). Responses are cached for a day.
- **Action:** (1) require an authenticated session OR sign the URL with an HMAC the client can't forge; (2) block private/loopback/link-local IP ranges and non-public hosts (resolve DNS and reject RFC1918/169.254/::1/fc00::/etc.); (3) cap response size; (4) keep the content-type allow-list; (5) add rate limiting.

### C3. SSRF in OG scraping (`fetchOgPreview`, `src/app/(app)/vault/actions.ts`)
- **Confirmed:** server action fetches any user-supplied URL (vault item link) to scrape OG tags. Same SSRF surface as C2 (behind auth, but still hits internal targets).
- **Action:** same host/IP allow-list + size cap as C2; ideally a shared `safeFetch()` helper used by both.

### C4. Storage buckets are over-permissive + public  (`schema.sql` storage policies + avatars/banners)
- **Confirmed (vault):** policies allow **any authenticated user** to `select/insert/update/delete` **any** object in the bucket — NOT scoped to their own couple's path. Bucket is **public**.
- **Risk:**
  - **Cross-couple tampering:** a user can `delete`/overwrite another couple's vault images (and avatars/banners if those policies are equally broad — needs verification).
  - **Privacy:** public buckets mean every banner / vault photo / avatar is reachable by its URL with **no auth** — couple photos are effectively public to anyone who gets the link.
- **Action:** (1) scope storage RLS to the object's path prefix = caller's `couple_id` (write/update/delete), e.g. `(storage.foldername(name))[1] = (select couple_id::text from profiles where id = auth.uid())`; (2) decide public vs private buckets (see Q3) — if private, serve via signed URLs; (3) verify avatars/banners policies, not just vault.

### C5. Invite codes — join ANY couple, no member cap, no expiry, no rate limit
- **Confirmed:** `join_couple_for_user(code)` sets the caller's `couple_id` to whatever couple matches the 8-hex-char `invite_code`. There is **no check that the couple already has 2 members**, **no expiry**, **no attempt rate limit**, and the code is short (~4B space).
- **Risk:** a leaked/forwarded/guessed code lets **a third (or Nth) person join an existing couple** and get full read/write to all their data (calendar, ledger, vault, notes, moods). Invite links are literally what we're about to email testers.
- **Action:** (1) reject join if the couple already has 2 members; (2) make codes single-use / regenerable / expiring; (3) rate-limit join attempts per user/IP; (4) consider longer codes. Confirm desired couple size (Q4).

---

## 🟠 HIGH — fix before broad beta

### H1. Legacy un-hardened security-definer RPCs (APP_REVIEW #20)
- Functions the app no longer calls but still exposed & **without `auth.uid()` guards**: `add_event, add_ledger_entry, add_savings_pot, add_vault_item(x2), contribute_to_pot, delete_countdown, delete_event, delete_savings_pot, delete_vault_item, settle_all, update_vault_item(x2), update_vault_stage, update_my_role, my_couple_id`.
- **Risk:** `update_my_role(p_user_id, p_role)` lets anyone set anyone's role to anything. `delete_*`/`settle_all`/`contribute_to_pot` act by `couple_id` only — if a couple_id leaks (it's a UUID but appears in some client payloads/realtime topics), an attacker can delete/settle/mutate that couple's data.
- **Action:** `drop function` all of these (preferred — they're unused), or harden each. Provide a drop script after confirming none are referenced (grep `rpc("…")`).

### H2. URL-based XSS in vault item links
- **Confirmed:** vault `item.url` is opened via `window.open(item.url)` (line ~642) and rendered as `<a href={item.url}>` (line ~892). A stored value like `javascript:fetch('/...')` executes on click/open.
- **Risk:** stored XSS — one couple member (or a joined attacker, see C5) plants a malicious link; the partner clicks it → script runs in their session (can call server actions, exfiltrate).
- **Action:** validate/normalise URLs on input and render — only allow `http:`/`https:` (reject `javascript:`, `data:`, etc.); store sanitised, and guard at render.

### H3. Missing security headers / CSP  (`next.config.ts` is empty)
- **Confirmed:** no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- **Risk:** clickjacking (app can be iframed), no defense-in-depth against XSS, MIME sniffing, referrer leakage.
- **Action:** add a `headers()` block in `next.config.ts`: `X-Frame-Options: DENY` (or frame-ancestors 'none'), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (disable geolocation/camera/etc. except what's needed), `Strict-Transport-Security`, and a CSP (start report-only — Supabase, Google fonts, self, the img-proxy domain; `frame-ancestors 'none'`).

### H4. Realtime broadcast channels not authorization-scoped
- **Likely issue:** the app uses `supabase.channel('notif-'+coupleId).on('broadcast', …)` and `'dash-'+coupleId`. Supabase **broadcast** channels are, by default, open to **any authenticated client that knows the topic name** (the couple_id). `postgres_changes` subscriptions *do* respect RLS; broadcast does **not** unless Realtime Authorization (RLS on `realtime.messages`) is enabled.
- **Risk:** a user who learns another couple's `couple_id` can subscribe and read their live mood/activity/note broadcasts.
- **Action:** enable Supabase **Realtime Authorization** and add RLS so only couple members can subscribe to that couple's topic; or move sensitive realtime to `postgres_changes` (RLS-backed). Confirm current Realtime settings (Q5).

### H5. Authorship spoofing on inserts (`created_by`/`paid_by`)
- Insert server actions trust client-supplied `created_by`/`paid_by`. RLS only checks `is_couple_member(couple_id)`.
- **Risk:** intra-couple integrity only (a member forges "who logged"/"who paid"/"who created"). Can't cross couples. Lower impact but affects financial attribution in the ledger.
- **Action:** set `created_by/paid_by = auth.uid()` server-side (or DB default), validate `paid_by` is a member of the couple.

---

## 🟡 MEDIUM

### M1. No rate limiting anywhere
- Server actions, RPCs, `img-proxy`, OG scraping, join attempts, OAuth callback — none are rate-limited.
- **Risk:** brute-force invite codes (C5), abuse the open proxy (C2), DoS via expensive scrapes, spam writes.
- **Action:** add per-IP/per-user rate limiting (Vercel Edge Middleware + Upstash Redis, or Supabase rate limits) on `img-proxy`, OG fetch, and join. Supabase Auth already rate-limits sign-in.

### M2. File-upload validation (storage)
- No server-side enforcement of file type/size; bucket is public.
- **Risk:** upload an **SVG with embedded `<script>`** (or HTML polyglot); served from a public bucket and opened directly → stored XSS on your storage origin; or upload huge files (storage abuse).
- **Action:** restrict allowed MIME/extensions to raster images (jpg/png/webp), strip/deny SVG, cap size, set `Content-Disposition: attachment` or a separate non-app origin for user uploads; re-encode images server-side if feasible.

### M3. OAuth / open-redirect review
- Confirm no user-controlled redirect target flows into `signInWithOAuth({ redirectTo })` or the callback. (Current code uses fixed `${origin}/auth/callback` and `${origin}/` — looks OK, verify no `?next=` param is honoured.)

### M4. Account & data deletion (privacy/GDPR-lite)
- No self-serve "delete my account / data". Leaving a couple only nulls `couple_id`; data persists.
- **Action (beta-acceptable):** document a manual deletion process; plan a self-serve delete before public launch. Add a privacy note for testers.

### M5. Error/info leakage
- Ensure production never returns stack traces or internal messages. The temporary onboarding-loop diagnostic was REMOVED — confirm nothing debug-ish remains (grep for "DIAGNOSTIC", console.log of PII, etc.). Server-action error strings returned to client should be generic.

### M6. Cookie / session flags
- Confirm Supabase auth cookies are `HttpOnly`, `Secure`, `SameSite=Lax` in production (default via `@supabase/ssr`, but verify on the deployed domain). Confirm session TTL/refresh behaviour is acceptable.

---

## 🟢 LOW / HARDENING

- **L1. Dependency audit:** run `npm audit` (and `npm audit fix`); pin/update anything high/critical. Check `@base-ui/react`, `qrcode.react`, `web-push`, `framer-motion` versions.
- **L2. Secret hygiene:** `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` are server-only (good — used in `src/lib/push.ts`, not `NEXT_PUBLIC`). Confirm **no service-role key** anywhere (none found in `src/`). Confirm Vercel env vars are set to the right environments and not exposed.
- **L3. Reduce attack surface:** drop legacy unused tables (`expenses, mood_checkins, mood_reveal, notes, tasks`) and the legacy RPCs (H1). Fewer endpoints = less to secure.
- **L4. RLS WITH CHECK on inserts:** the generic `for all using (is_couple_member(couple_id))` policies rely on Postgres using `USING` as `WITH CHECK` when the latter is omitted — confirm inserts can't set a foreign `couple_id`. Add explicit `with check` to be safe.
- **L5. Push payload:** notification body includes user text (expense title) — fine, but ensure no HTML injection into the notification (it's plain text). Low risk.
- **L6. PWA/service worker:** SW caches GET responses (already restricted to same-origin, ok); ensure it never caches authed API/RSC with sensitive data for the wrong user (it excludes `/api` & `/auth`). Confirm.
- **L7. Logging/monitoring:** enable Vercel/Supabase logs review; consider Supabase **Security Advisor** (it flags RLS gaps, exposed functions) — run it and clear findings.

---

## DECISIONS (from user, 2026-06-02)
- **C1 hardening:** user answered "haven't run it" — but had previously run the same inline SQL ("success"). ⚠️ TREAT AS UNVERIFIED. Action: **re-run `security_hardening.sql` (idempotent)** + run verification query before beta. Highest priority.
- **C5 couple size:** **cap at 2 now, but keep adjustable** (e.g. a `max_members` notion or a single constant) for possible group spaces later. Invite must refuse the 3rd joiner.
- **C4 storage:** **make banners + vault photos PRIVATE** (private buckets + signed URLs). Avatars: decide (likely private too, or keep public since they're low-sensitivity — confirm). App must switch from `getPublicUrl` to signed URLs wherever images render.
- **C2/C3 img-proxy + OG scraping:** **RECOMMENDATION = remove both** (kills both SSRF surfaces entirely; vault keeps emoji + uploaded photos, loses external link thumbnails). Re-add a sandboxed preview post-beta if wanted. (User undecided — leaning on this recommendation.)

## OPEN QUESTIONS (remaining)

1. **Has `security_hardening.sql` been fully applied** to the live DB for *all* listed functions (incl. the dashboard-only ones and the newer `update_couple_currency`/`update_couple_banner_focus`)? (C1)
2. **img-proxy:** is it still needed? (It exists to bypass image hotlink protection.) If we make storage private + only show user-uploaded images, we may be able to delete it and remove the SSRF surface entirely. (C2)
3. **Storage privacy:** should couple **banners/vault photos** be private (signed URLs, not guessable/public) or is public-by-URL acceptable for beta? Avatars? (C4)
4. **Couple size:** strictly 2 people per couple? (Drives the invite member-cap fix.) (C5)
5. **Realtime:** is Supabase **Realtime Authorization** enabled, or are broadcast channels open? (H4)
6. **Beta scale & duration:** how many testers, how long? (Drives how much rate-limiting/monitoring is worth doing now vs later.)
7. **Custom domain / HSTS:** staying on `*.vercel.app` or moving to `aspaceforus.app`? (Affects HSTS, cookie domain, CSP.)
8. **Compliance:** any need for a privacy policy / data-deletion path for testers now, or post-beta?

---

## SUGGESTED EXECUTION ORDER (once approved)
1. C1 verify → C5 invite cap → C4 storage scoping → C2/C3 SSRF guard (or delete img-proxy) → H1 drop legacy RPCs.
2. H2 URL sanitisation → H3 security headers/CSP → H4 realtime authz → H5 authorship.
3. M1 rate limiting → M2 upload validation → M5/M6 verify → L-series hardening.
4. Final: Supabase Security Advisor pass, `npm audit`, second-account pen-test of each surface.

## PROGRESS LOG
- 2026-06-02 · Plan authored.
- 2026-06-02 · ✅ C1 DONE & VERIFIED — ran `run_all.sql` (full IDOR hardening + push fix + profile backfill + currency/banner columns). Verification query returns only `handle_new_user`.
- 2026-06-02 · ✅ H1 DONE — ran `drop_legacy_functions.sql`; all legacy unguarded SECURITY DEFINER functions dropped (add_*/delete_*/settle_all/contribute_to_pot/update_my_role/update_vault_*/4-arg save_push_subscription). Re-verify returns only `handle_new_user`.
- 2026-06-02 · CODE READY (local commits, not yet deployed — Vercel queue wedged):
  - ✅ H3 security headers (`next.config.ts`) — X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS. (CSP deferred to a tested step.)
  - ✅ H2 vault URL sanitisation — `safeExternalUrl()` allows only http/https at open + render.
  - ✅ C2/C3 SSRF removed — deleted `/api/img-proxy` route + `fetchOgPreview` scraper + all OG auto-fetch UI. Vault keeps emoji + uploaded photos.
  - ✅ C5 invite cap (code half) — `joinCouple` handles a `full` result. DB half in `supabase/invite_cap.sql` (run AFTER this code deploys).
- C4 (private photos) — `supabase/storage_private.sql` prepared but **DO NOT RUN** until the app renders signed URLs. App side is a real refactor (see below) and MUST be verified on a Vercel preview deploy before prod, since a mistake breaks all images.
- STILL TODO (code): H4 realtime authz, H5 server-side authorship, M-series (rate limiting, upload validation), CSP.

### C4 app-side implementation note (for when we can preview-deploy)
Buckets go private → existing public URLs 403 → app must render via signed URLs.
Plan: client helper `useSignedUrl(stored)` that extracts `{bucket,path}` from the stored
public URL (or treats a bare path as-is) and calls `storage.from(bucket).createSignedUrl(path, 3600)`
(works with the user session because the new RLS lets couple members SELECT/sign their objects —
no service-role key needed). Apply at every `<img>`: home banner (HomeBanner), profile avatar+banner,
mood-card avatars, OwnerAvatars (make it a client component or pass signed URLs in), vault item images.
Keep storing the existing value (public URL) — the helper handles both forms, so no data migration.
Test order: push to a branch → preview URL → run `storage_private.sql` against a *staging* project (or
accept brief breakage and run on prod only after preview confirms) → verify every image loads → promote.
