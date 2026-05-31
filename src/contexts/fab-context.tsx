"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

type FabAction = (() => void) | null;

interface FabContextValue {
  action: FabAction;
  setAction: (fn: FabAction) => void;
}

const FabContext = createContext<FabContextValue>({ action: null, setAction: () => {} });

export function FabProvider({ children }: { children: React.ReactNode }) {
  const [action, _set] = useState<FabAction>(null);
  const setAction = useCallback((fn: FabAction) => {
    _set(fn ? () => fn : null);
  }, []);
  return <FabContext.Provider value={{ action, setAction }}>{children}</FabContext.Provider>;
}

export function useFab() {
  return useContext(FabContext);
}

export function useRegisterFab(fn: () => void) {
  const { setAction } = useFab();
  useEffect(() => {
    setAction(fn);
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
