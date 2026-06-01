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

/** Soft left-to-right ombre wash: the owner's accent, or the shared wash. */
export function cardOmbre(o: OwnerIdentity): string {
  if (!o.shared) return `linear-gradient(100deg, ${o.people[0].light} 0%, #ffffff 46%)`;
  return `linear-gradient(100deg, ${SHARED_A} 0%, ${SHARED_B} 30%, #ffffff 60%)`;
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
