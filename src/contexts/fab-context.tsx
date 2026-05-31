"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

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
