// Placeholder legal copy. Swap the `body` paragraphs for the real Privacy Policy
// and Terms of Service once they're written, and bump `updated`. The structure
// (title / updated / paragraphs) is all the LegalSheet needs — no code changes
// required when the real text lands.

export type LegalDoc = "privacy" | "terms";

export const LEGAL: Record<LegalDoc, { title: string; updated: string; body: string[] }> = {
  privacy: {
    title: "privacy policy",
    updated: "coming soon",
    body: [
      "This is a placeholder for the us. privacy policy. The final version will be published here before launch.",
      "In short: us. is a private space for two people. Your moods, notes, photos, lists, events and ledger entries are visible only to you and your partner.",
      "When the full policy is ready it will cover what we collect, how it's stored, how long we keep it, and how to delete your data.",
      "Questions in the meantime? Email bukkyn@gmail.com.",
    ],
  },
  terms: {
    title: "terms of service",
    updated: "coming soon",
    body: [
      "This is a placeholder for the us. terms of service. The final version will be published here before launch.",
      "By using us. you agree to use it respectfully and lawfully, and you understand the app is provided as-is while in active development.",
      "The ledger is a shared record-keeper to help you split costs fairly — it does not move money and is not a payment or banking service.",
      "The full terms will cover accounts, subscriptions, acceptable use, and liability. Questions? Email bukkyn@gmail.com.",
    ],
  },
};
