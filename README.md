This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment variables

Set these in `.env.local` (dev) and in the Vercel project settings (prod).

### Supabase / push (existing)
| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Supabase anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Used by the engagement cron route to read all push subscriptions. **Secret.** |
| `VAPID_SUBJECT` | server | Web-push VAPID subject (e.g. `mailto:you@example.com`). |
| `VAPID_PRIVATE_KEY` | server | Web-push VAPID private key. **Secret.** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | client | Web-push VAPID public key. |
| `CRON_SECRET` | server + GitHub Actions secret | Bearer token guarding `/api/cron/engagement`. |

### Observability — PostHog (new)
| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | client | PostHog project API key. **If unset, analytics is a safe no-op** (the app still runs). |
| `NEXT_PUBLIC_POSTHOG_HOST` | client | PostHog host. Optional — defaults to `https://eu.i.posthog.com`. |

### Observability — Sentry (new)
| Var | Scope | Notes |
|---|---|---|
| `SENTRY_DSN` | server + edge | Sentry DSN for server/edge runtimes. If unset, Sentry init is skipped. |
| `NEXT_PUBLIC_SENTRY_DSN` | client | Sentry DSN for the browser (set to the **same value** as `SENTRY_DSN`; the browser can only read `NEXT_PUBLIC_*`). If unset, client Sentry is skipped. |
| `SENTRY_ORG` | build | Optional. Org slug for source-map upload. |
| `SENTRY_PROJECT` | build | Optional. Project slug for source-map upload. |
| `SENTRY_AUTH_TOKEN` | build | Optional. **Source-map upload is skipped when this is absent**, so builds never fail without Sentry configured. **Secret.** |

> `tracesSampleRate` is `0.1` in production and `1.0` in development.

### Dev simulation (new)
| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_FORCE_WEBVIEW` | client (dev) | Set to `true` to force the "open in your browser / copy link" WebView fallback banner on the login screen, without a real in-app browser. |

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
