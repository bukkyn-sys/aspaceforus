"use client";

import type { CSSProperties } from "react";
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
/**
 * Card styling by ownership. The accent lives entirely on the RIGHT — a clean
 * grey/card left, a gentle accent rise on the right, and a curved accent stroke
 * (inset box-shadow follows the rounded corners). Shared/unattached cards get a
 * neutral grey rise and NO stroke, so only personal cards carry colour.
 */
export function ownerCardStyle(o: OwnerIdentity): CSSProperties {
  // No border on owner cards — the faint card border left only a lone hairline on
  // the left once the accent stroke covered the right edge, which read as a glitch.
  // The gradient + drop shadow define the card instead.
  if (o.shared) {
    return {
      background: `linear-gradient(90deg, var(--card) 55%, var(--event-band) 100%)`,
      borderColor: "transparent",
    };
  }
  const hex = o.people[0].hex;
  const tint = `color-mix(in srgb, ${hex} var(--wash-accent), var(--card))`;
  // Right accent stroke via inset shadow — follows the rounded corners (curves).
  return {
    background: `linear-gradient(90deg, var(--card) 50%, ${tint} 100%)`,
    borderColor: "transparent",
    boxShadow: `inset -2.5px 0 0 0 ${hex}, var(--card-shadow)`,
  };
}

/** A subtle accent tint over the card surface — for emoji tiles, chips, etc. */
export function ownerTint(hex: string): string {
  return `color-mix(in srgb, ${hex} var(--tile-accent), var(--card))`;
}

/** A pale panel colour (folder lists) mixed toward the card so it adapts to dark. */
export function panelTint(hex: string): string {
  return `color-mix(in srgb, ${hex} var(--panel-accent), var(--card))`;
}

/** Folder-panel background — pale category tint on the right, clean left. No
 *  stroke (folders aren't owned by a person). */
export function panelOmbre(hex: string): string {
  return `linear-gradient(90deg, var(--card) 50%, ${panelTint(hex)} 100%)`;
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
