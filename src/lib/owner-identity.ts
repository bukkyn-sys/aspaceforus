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
 * Built with color-mix over var(--card) and mode-aware --wash-* strengths so it
 * looks tuned in both light and dark. Uses a flat 90deg fade that fully resolves
 * to the card colour (no angled corner sliver) and clears the right ~third so
 * trailing content/chevrons sit on a clean surface.
 */
// Soft accent arc hugging the right edge — fills the otherwise-plain right side
// of a card with a gentle curved glow of the accent. Sits on top of the linear
// wash and fades to transparent so the middle of the card stays clean.
function rightArc(hex: string): string {
  const arc = `color-mix(in srgb, ${hex} var(--arc-accent), var(--card))`;
  return `radial-gradient(56% 132% at 118% 50%, ${arc} 0%, transparent 58%)`;
}

export function cardOmbre(o: OwnerIdentity): string {
  if (!o.shared) {
    const tint = `color-mix(in srgb, ${o.people[0].hex} var(--wash-accent), var(--card))`;
    return `${rightArc(o.people[0].hex)}, linear-gradient(90deg, ${tint} 0%, var(--card) 64%)`;
  }
  const a = `color-mix(in srgb, ${SHARED_A} var(--wash-shared), var(--card))`;
  const b = `color-mix(in srgb, ${SHARED_B} var(--wash-shared), var(--card))`;
  return `${rightArc(SHARED_A)}, linear-gradient(90deg, ${a} 0%, ${b} 30%, var(--card) 66%)`;
}

/** A subtle accent tint over the card surface — for emoji tiles, chips, etc. */
export function ownerTint(hex: string): string {
  return `color-mix(in srgb, ${hex} var(--tile-accent), var(--card))`;
}

/** A pale panel colour (folder lists) mixed toward the card so it adapts to dark. */
export function panelTint(hex: string): string {
  return `color-mix(in srgb, ${hex} var(--panel-accent), var(--card))`;
}

/** Full folder-panel background: left tint + clean middle + right accent arc. */
export function panelOmbre(hex: string): string {
  return `${rightArc(hex)}, linear-gradient(90deg, ${panelTint(hex)} 0%, var(--card) 58%)`;
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
