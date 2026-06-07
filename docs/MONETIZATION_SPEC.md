# us. — Monetization Spec v1

_Status: agreed design, pre-implementation. Owner: Bukky. Last updated: 2026-06-07._

## 1. Model

Freemium with a **30-day full-Premium trial** for new couples (no card required), then a
soft landing onto a **quota'd Free tier**. Subscribing (either partner) restores Premium for
the whole couple. Billed via **Stripe on the web** — because us. is a PWA there is **no
30% app-store cut**, which funds the low founding price and better margins.

Premium is **couple-level**: the space is shared (shared vault, calendar, ledger), so
entitlement is always for the `couple`, never an individual.

## 2. Pricing (founding)

Shown to users as **founding pricing** ("while we're new"), with a Founding Member framing.

| Plan | Price | Notes |
|---|---|---|
| **Both, one payer** | **£1.98 / mo** | Advertised as **"99p each · £1.98 for both."** One partner pays, both unlock. |
| **Annual** | **£19.99 / yr** | **Locks the founding rate** for the paid term. The conversion lever. |
| **Split-pay (fast-follow)** | **99p / mo each** | Two separate subs, one per partner; activates only when both are paying. See §6. |

**Price increases:** prices are Stripe **price-IDs**.
- **Annual** holders are honoured at their price for the full term (Stripe keeps their price
  until renewal).
- **Monthly** is explicitly positioned as "may rise as the app matures." When raised,
  existing monthly subscribers are **migrated up with the legally-required notice** (not
  grandfathered). Annual is therefore the way to lock the founding rate.

## 3. Free vs Premium — quota matrix

Principle: **don't quota the emotional core in a hostile way; quota what costs us money
(storage) or signals a power user (breadth), plus history/archives and polish as upgrade
pull.** Memories get a *generous* cap, not a tight one.

| Area | Free (post-trial) | Premium |
|---|---|---|
| **Photos (vault)** | **50 photos**, 1 album | Unlimited photos + albums |
| **Calendar** | Full function in the **current calendar month** only; future months **read-only** | Plan in **any** month + recurring events + reminders |
| **To-do lists** | **2 lists** (items unlimited) | Unlimited lists |
| **Vault list folders** | 2 defaults (date ideas + wishlist) | Unlimited custom folders |
| **Savings pots** | **1 pot** (expenses unlimited) | Unlimited pots + folders |
| **Daily question** | Today only | Full archive / look-back |
| **Mood** | Current + 7-day | Full history + trends |
| **Ledger history** | Active entries | Settled history + CSV export |
| **Home events/countdowns** | 3 active | Unlimited |
| **Themes / accent / banner** | Default | Full palette + custom banner |
| **Dashboard layout** | Default | Rearrange / resize modules |

### Calendar gate — precise rules
- Free: view + add/edit events and set availability **for the current rolling calendar
  month**.
- Free: can **navigate to and view** future months (feel the locked potential) but **any
  create/edit with a date beyond the current month is blocked** → Premium prompt.
- **Recurring events are Premium** (they span months).
- Past months are viewable (history), no editing needed.
- Indirect write paths must hit the same gate: Home's "plan this free window" deep-link and
  the event-sheet date picker.
- "Current month" is computed **server-side** from the user's timezone on every write —
  never trust a client-supplied date.

### Quota enforcement & soft landing
- **Enforced server-side** in the existing server actions (`addPhoto`, `createTodoList`,
  pot create, event create, …): `if (!is_premium && count >= LIMIT) return { error: 'quota' }`.
- **DB trigger safety net** on storage-heavy tables (`vault_photos`) so the cap can't be
  bypassed client-side.
- Client reads `is_premium` for UX only.
- **Never delete a couple's content to enforce a quota.** Trial content is grandfathered:
  if a couple is over a Free cap at trial end, existing content stays fully viewable; only
  **new** additions beyond the cap are blocked until they upgrade or self-prune.

## 4. Trial — 30 days, identity-keyed (this is also the anti-farming mechanism)

Trial eligibility belongs to the **person**, not the couple.

- Each user has a once-ever trial: `profiles.trial_consumed_at`.
- A couple gets the 30-day trial **only if neither partner has ever consumed one.** Starting
  it **marks both partners consumed.** Clock starts at **pairing**:
  `trial_ends_at = paired_at + 30d`.
- **Anti-farming:** a fresh trial now requires **two brand-new identities every time** —
  re-pairing existing accounts grants nothing. Leaving + re-pairing = no new trial.
- **Email hardening:** normalize on signup (lowercase, strip Gmail `+tags`/dots →
  `profiles.email_normalized`) so alias spam can't cheaply mint eligibility. This won't stop
  a determined farmer with unlimited real emails, but combined with the "two fresh accounts
  each time" requirement it makes farming more effort than paying £1.98. Heavier KYC is not
  worth it for this app.
- **Accepted fairness edge:** a genuinely-new user who pairs with an ex-trialer gets no
  trial. Planned mitigation (later, only if drop-off shows): offer that fresh user a
  **discounted first month** instead of a trial.
- Nudges: subtle "X days of Premium left" pill on Home from ~day 24, one well-timed "keep
  Premium" prompt at day 27–29.

## 5. Couple dissolution = cancellation (non-exploitable)

- Partner leaving / couple dissolving → **all couple subscriptions set to cancel, no
  refund.** No-refund removes the "subscribe → use → leave to claw money back" play.
- If mid-trial, the trial is already **consumed for both** (§4) — can't bail to reset.
- Remaining partner is notified and can re-subscribe if they re-pair, but gets **no fresh
  trial**. Dissolution yields zero free upside.
- **Adjacent open question (not monetization):** what happens to shared data on a breakup —
  frozen / exported / deleted? Decide separately.

## 6. Split-pay (99p each) — designed now, shipped as fast-follow

**Launch reality:** a single **£1.98/mo** sub from one payer, **advertised as "99p each."**
The data model and entitlement are built so true split-pay drops in without repainting.

- Entitlement is **"couple is fully funded,"** not "has a sub":
  `is_premium = trial active OR single sub active OR (both 99p split subs active)`.
- **Half-paid handling (the hard part):** if A pays 99p before B, do **not** unlock for 99p
  and do **not** bill A for a locked product. Create A's Stripe sub
  **paused/uncollected ("waiting for your partner")**; when B subscribes, **resume both
  together** so billing + Premium start in sync. If B never joins within ~14 days, cancel A's
  pending sub (never charged).
- This doubles as a **viral/commitment mechanic**: "you've paid your half — nudge [partner]
  to pay theirs."
- Split is **monthly-only**; the annual founding lock is a single-payer perk.

## 7. Data model (delta)

```
profiles
  + trial_consumed_at   timestamptz   -- once-ever per user; trial grant gate + anti-farming
  + email_normalized    text          -- lowercased, +tags/dots stripped (gmail)

couples
  + paired_at           timestamptz   -- trial clock origin
  + trial_ends_at       timestamptz

subscriptions (new; couple can have 1 'single' row or 2 'split' rows)
  id, couple_id (fk), payer_user_id,
  stripe_customer_id, stripe_subscription_id,
  status,                 -- trialing|active|past_due|canceled
  plan_kind,              -- 'single' | 'split'
  activation_state,       -- 'waiting_partner' | 'active' | 'canceled'
  price_id, current_period_end, cancel_at_period_end
```

**Single source of truth:** `is_premium(couple_id)` SECURITY DEFINER fn implementing
trial-OR-single-OR-both-split. Used by server actions, the DB trigger safety net, and
exposed to the client for UX.

## 8. Billing infra (Stripe)

- **Stripe Checkout** (hosted) to subscribe; **Customer Portal** to manage/cancel/update
  card. PCI offloaded.
- **Stripe Tax** on for VAT.
- **Webhooks** → server route updating Supabase: `checkout.session.completed`,
  `customer.subscription.updated/deleted`, `invoice.payment_failed`.
- **Guards:** before opening Checkout, check the couple has no active/pending sub
  (prevents double-charge). `past_due` → keep Premium through a ~7-day grace + dunning, then
  downgrade.

## 9. Paywall / upgrade UX

- **Upgrade screen** in Profile: plan state, what Premium unlocks, founding price, Founding
  Member badge, manage button (→ Portal).
- **Contextual paywall sheet** at the point of friction (50th photo, planning into next
  month, 3rd to-do list, 2nd pot…), one tap to Checkout.
- **Trial banner** on Home with days-left + CTA.
- All copy in the app's warm, lowercase voice.

## 10. Metrics (PostHog)

Funnel: `trial_started → trial_active_dN → paywall_viewed{context} → checkout_started →
subscribed → (churned)`, plus `quota_hit{area}`. Tells us **which quota actually drives
upgrades** so we can tune the matrix — essential given the "learn first" pricing stance.
Price behind a Stripe price-ID + PostHog flag for A/B without redeploys.

## 11. Rollout phases

1. **Plumbing (dark):** trial fields, identity trial-consumption + email normalization,
   `is_premium` (trial + single-sub logic). No UI, no enforcement. Safe to land anytime.
2. **Stripe single-payer:** Checkout + Portal + webhooks + double-subscribe guard. Monthly
   (£1.98) **and** annual (£19.99) founding price-IDs.
3. **Enforce + paywall + trial:** server-side quotas (incl. calendar current-month gate),
   contextual sheets, 30-day trial banner, founding upgrade screen, dissolution = cancel.
4. **Premium polish:** themes, archives, dashboard layout, recurrence/reminders.
5. **Split-pay (99p each):** paused-until-partner activation, partial-state UX, "nudge your
   partner" mechanic.

## 12. Open decisions / deferred

- Breakup **data handling** (freeze/export/delete) — adjacent, decide separately.
- Monthly **price-increase notice** flow (email + in-app) — build when first raising prices.
- **Discounted first month** for an ex-trialer's fresh partner — add only if §4 drop-off
  shows.
