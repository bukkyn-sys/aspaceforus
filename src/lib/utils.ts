import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { KeyboardEvent } from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
