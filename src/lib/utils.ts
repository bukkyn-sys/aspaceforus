import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { KeyboardEvent } from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Thousands-separated number (en-GB): 40000 → "40,000", 40.5 → "40.50".
export function commas(n: number, decimals = 0): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Money with the couple's currency symbol + thousands separators.
// money(40000) → "£40,000"; money(40.5, "£", 2) → "£40.50". Sign is dropped —
// callers prefix +/− themselves where they show a direction.
export function money(amount: number, currency = "£", decimals = 0): string {
  return `${currency}${commas(Math.abs(amount), decimals)}`;
}

// Add separators to an already-formatted price string like "£40000" → "£40,000"
// (used for stored wishlist prices). Leaves "free" / unparseable values as-is.
export function commafyPrice(price: string | null): string | null {
  if (!price || price === "free") return price;
  const m = price.match(/^([£$€]?)\s*([\d.,]+)(.*)$/);
  if (!m) return price;
  const n = parseFloat(m[2].replace(/,/g, ""));
  if (Number.isNaN(n)) return price;
  const decimals = m[2].includes(".") ? 2 : 0;
  return `${m[1]}${commas(n, decimals)}${m[3]}`;
}

// Makes a non-button element (e.g. a card <div>) behave as a button for keyboard
// and screen-reader users: focusable, role=button, and Enter/Space activate it.
// Spread onto the element: <div {...clickable(() => ...)}>
export function clickable(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
