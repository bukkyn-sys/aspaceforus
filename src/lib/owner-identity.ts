"use client";

import { useCouple } from "@/contexts/couple-context";
import { getAccent } from "@/lib/accent-colors";

export interface OwnerPerson {
  url: string | null;
  name: string;
  hex: string;
  light: string;
}

export interface OwnerIdentity {
  people: OwnerPerson[];
  shared: boolean;
}

// A dedicated "together" wash for shared items — a soft twilight lilac → slate
// that deliberately matches none of the personal accent colours.
const SHARED_A = "#E7E3F1";
const SHARED_B = "#E2ECF0";

/**
 * Soft left-to-right ombre wash: the owner's accent, or the shared wash.
 * Built with color-mix over var(--card) so it adapts to light/dark automatically
 * (in light mode card is white → near-identical to the old hardcoded washes).
 */
export function cardOmbre(o: OwnerIdentity): string {
  if (!o.shared) {
    const tint = `color-mix(in srgb, ${o.people[0].hex} 16%, var(--card))`;
    return `linear-gradient(100deg, ${tint} 0%, var(--card) 55%)`;
  }
  const a = `color-mix(in srgb, ${SHARED_A} 60%, var(--card))`;
  const b = `color-mix(in srgb, ${SHARED_B} 60%, var(--card))`;
  return `linear-gradient(100deg, ${a} 0%, ${b} 28%, var(--card) 62%)`;
}

/** A subtle accent tint over the card surface — for emoji tiles, chips, etc. */
export function ownerTint(hex: string): string {
  return `color-mix(in srgb, ${hex} 20%, var(--card))`;
}

/** A pale panel colour (folder lists) mixed toward the card so it adapts to dark. */
export function panelTint(hex: string): string {
  return `color-mix(in srgb, ${hex} 55%, var(--card))`;
}

/**
 * Resolve who an item belongs to. Pass an owner id, or "shared"/null.
 * - your id          → just you
 * - your partner's id → just your partner
 * - anything else     → shared (both of you)
 */
export function useOwnerIdentity() {
  const { me, partner, myName, partnerName } = useCouple();
  const myAccent = getAccent(me.accent_color);
  const partnerAccent = getAccent(partner?.accent_color);

  const meEntry: OwnerPerson = { url: me.avatar_url, name: myName, hex: myAccent.hex, light: myAccent.light };
  const partnerEntry: OwnerPerson | null = partner
    ? { url: partner.avatar_url, name: partnerName, hex: partnerAccent.hex, light: partnerAccent.light }
    : null;

  return function resolve(owner: string | null): OwnerIdentity {
    if (owner === me.id) return { people: [meEntry], shared: false };
    if (partner && partnerEntry && owner === partner.id) return { people: [partnerEntry], shared: false };
    return { people: partnerEntry ? [meEntry, partnerEntry] : [meEntry], shared: true };
  };
}
