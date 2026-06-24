// Privacy Policy + Terms of Service shown in-app via LegalSheet.
//
// ⚠️ BEFORE PUBLIC LAUNCH: have a solicitor review this and fill in the two
// bracketed placeholders below — [LEGAL ENTITY] (the person/company that is the
// data controller) and [JURISDICTION] (e.g. "England and Wales"). The copy is a
// solid, accurate first draft for a UK/EU consumer app that takes payments and
// holds personal data, but it is not legal advice. Bump `updated` when you edit.

export type LegalDoc = "privacy" | "terms";

const CONTACT = "bukkyn@gmail.com";
const UPDATED = "25 June 2026";

export const LEGAL: Record<LegalDoc, { title: string; updated: string; body: string[] }> = {
  privacy: {
    title: "privacy policy",
    updated: UPDATED,
    body: [
      "us. (\"we\", \"us\") is a private shared space for two people. This policy explains what personal data we collect, why, how long we keep it, and the rights you have. The data controller is [LEGAL ENTITY]. For any privacy question or request, email " + CONTACT + ".",

      "WHAT WE COLLECT. Account: when you sign in with Google we receive your name, email address and profile picture. Content you create: your display name, accent colour, mood check-ins, shared note, photos, wishlists and date ideas, to-do lists, calendar availability and events, savings pots and ledger entries, and your answers to \"the daily\". Technical: a device push-notification token if you enable notifications, and basic usage/diagnostic data (see Analytics). Payments: if you subscribe, our payment processor handles your card details — we never see or store your full card number.",

      "HOW IT'S USED AND THE LAWFUL BASIS. We process your content to provide the app to you and your partner (performance of our contract with you). We process diagnostic and analytics data to keep the app working and improve it (our legitimate interests, and your consent where required for analytics). We process payment and subscription data to take payment and manage your plan (contract and legal obligation). We send push notifications only if you opt in (consent).",

      "WHO IT'S SHARED WITH. Your content is visible only to you and the partner you pair with — we do not sell your data or use it for advertising. We use a small number of processors who handle data on our behalf under contract: Supabase (database, authentication and file storage), Vercel (hosting), Stripe (payments), PostHog (product analytics), Sentry (error diagnostics) and a web-push service (notification delivery). Some of these may process data outside the UK/EEA under appropriate safeguards.",

      "STORAGE AND SECURITY. Data is stored in access-controlled databases and private file storage; row-level security restricts every record to the couple it belongs to, and photos are served via short-lived signed links. No system is perfectly secure, but we take reasonable technical and organisational measures to protect your data.",

      "RETENTION. We keep your data while your account is active. If you delete your account (Settings → delete account) we remove your profile and personal data; shared content in a space you created with a partner is reassigned to your partner so their space keeps working, or deleted if you are the only member. Backups are cycled out on a rolling basis. We may retain limited payment records where the law requires.",

      "YOUR RIGHTS. You can access, correct, export or delete your data, object to or restrict certain processing, and withdraw consent at any time. You can export your data and delete your account from Settings, or email us at " + CONTACT + ". You also have the right to complain to your data protection authority (in the UK, the ICO).",

      "CHILDREN. us. is not intended for anyone under 16. If you believe a child has provided us personal data, contact us and we will delete it.",

      "CHANGES. We may update this policy; we'll change the date above and, for material changes, tell you in the app. Questions: " + CONTACT + ".",
    ],
  },
  terms: {
    title: "terms of service",
    updated: UPDATED,
    body: [
      "These terms are an agreement between you and [LEGAL ENTITY] (\"we\", \"us\") for use of the us. app. By creating an account you accept them. If you do not agree, do not use us.",

      "THE SERVICE. us. is a private shared space for two people to track moods, notes, photos, plans, lists, events and shared costs. You need a Google account to sign in. You are responsible for keeping access to your account secure and for the content you add.",

      "YOUR CONTENT. You keep ownership of the content you add. You grant us only the limited permission needed to store and display it to you and your partner and to operate the service. Don't upload content that is unlawful, infringing, or that you don't have the right to share. We may remove content or suspend accounts that break these terms or the law.",

      "ACCEPTABLE USE. Use us. lawfully and respectfully. Don't attempt to access other people's spaces, probe or disrupt the service, scrape it, or misuse it to harass anyone. A space is limited to two members.",

      "THE LEDGER. The ledger is a shared record-keeper to help you split and track costs fairly. It does not move, hold or transfer money and is not a payment, banking or money-management service. You are responsible for any actual settlements between you.",

      "SUBSCRIPTIONS AND PAYMENTS. Premium is offered as a monthly or annual subscription, or a one-time \"lifetime\" purchase, at the prices shown at checkout (inclusive of any applicable tax). Subscriptions renew automatically until cancelled; you can cancel any time from the billing portal and keep access until the end of the paid period. Payments are processed by Stripe.",

      "REFUNDS AND CANCELLATION. As digital content supplied immediately, your statutory 14-day right to cancel is waived once access begins, which you acknowledge at purchase; beyond that we are not obliged to give refunds except where required by law. The lifetime offer is a one-time purchase for the lifetime of the service. If we materially reduce what premium offers, contact us.",

      "FREE AND PREMIUM TIERS. Some features are limited on the free tier and unlocked with premium. If a paid plan ends, your data is never deleted — premium-only items become view-only until you resubscribe.",

      "AVAILABILITY AND \"AS IS\". The app is provided on an \"as is\" and \"as available\" basis and is under active development; we don't guarantee it will always be available or error-free. To the extent permitted by law we exclude implied warranties and limit our liability for loss that wasn't reasonably foreseeable; nothing here limits liability that can't be limited by law. Keep your own copies of anything important — you can export your data from Settings.",

      "ENDING. You can delete your account at any time from Settings. We may suspend or end access if you breach these terms or the law.",

      "CHANGES AND GOVERNING LAW. We may update these terms; we'll change the date above and flag material changes in the app. These terms are governed by the laws of [JURISDICTION]. Questions: " + CONTACT + ".",
    ],
  },
};
