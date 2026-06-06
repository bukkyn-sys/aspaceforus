"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";

type FabAction = (() => void) | null;

// Split into two contexts so page components can subscribe to the setter
// without re-rendering every time the action value changes.
const FabSetContext = createContext<(fn: FabAction) => void>(() => {});
const FabGetContext = createContext<FabAction>(null);

export function FabProvider({ children }: { children: React.ReactNode }) {
  const [action, setRaw] = useState<FabAction>(null);
  const setAction = useCallback((fn: FabAction) => {
    setRaw(fn ? () => fn : null);
  }, []);
  return (
    <FabSetContext.Provider value={setAction}>
      <FabGetContext.Provider value={action}>
        {children}
      </FabGetContext.Provider>
    </FabSetContext.Provider>
  );
}

/** Read the current FAB action. Only BottomNav needs this. */
export function useFab() {
  return {
    action: useContext(FabGetContext),
    setAction: useContext(FabSetContext),
  };
}

/** Get the FAB setter only — subscribes to nothing that ever changes. */
export function useFabSetter() {
  return useContext(FabSetContext);
}

/** Register a FAB action for the lifetime of the calling component. */
export function useRegisterFab(fn: () => void) {
  const setAction = useFabSetter();
  useEffect(() => {
    setAction(fn);
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Scopes the FAB for a swipe pane. Several panes can be mounted at once (so a
 * neighbour is live while you drag), but only the ACTIVE one should own the FAB.
 * The gate remembers its pane's latest action and only forwards it to the real
 * FAB when this pane is active (pushing it on activation).
 */
export function FabGate({ active, children }: { active: boolean; children: ReactNode }) {
  const realSet = useContext(FabSetContext);
  const stored = useRef<FabAction>(null);
  const scopedSet = useCallback((fn: FabAction) => {
    stored.current = fn;
    if (active) realSet(fn);
  }, [active, realSet]);
  useEffect(() => {
    if (active) realSet(stored.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return <FabSetContext.Provider value={scopedSet}>{children}</FabSetContext.Provider>;
}
