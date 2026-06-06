"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// Live "which bottom-nav tab is active" — driven by the swipe pager's progress so
// the nav icon lights up the moment you cross the half-way point of a swipe,
// instead of waiting for the route to change. null = fall back to the pathname.
const NavGet = createContext<number | null>(null); // 0 home · 1 calendar · 2 vault · 3 ledger
const NavSet = createContext<(i: number | null) => void>(() => {});

export function NavActiveProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<number | null>(null);
  const set = useCallback((i: number | null) => setActive((prev) => (prev === i ? prev : i)), []);
  return (
    <NavSet.Provider value={set}>
      <NavGet.Provider value={active}>{children}</NavGet.Provider>
    </NavSet.Provider>
  );
}

export const useNavActive = () => useContext(NavGet);
export const useSetNavActive = () => useContext(NavSet);
