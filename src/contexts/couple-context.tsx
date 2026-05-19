"use client";

import { createContext, useContext } from "react";

export interface UserProfile {
  id: string;
  couple_id: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
}

export interface CoupleContextValue {
  coupleId: string;
  me: UserProfile;
  partner: UserProfile | null;
  /** First name only, falls back to "you" */
  myName: string;
  /** Partner's first name, falls back to "partner" */
  partnerName: string;
}

const CoupleContext = createContext<CoupleContextValue | null>(null);

export function CoupleProvider({
  value,
  children,
}: {
  value: CoupleContextValue;
  children: React.ReactNode;
}) {
  return (
    <CoupleContext.Provider value={value}>{children}</CoupleContext.Provider>
  );
}

export function useCouple(): CoupleContextValue {
  const ctx = useContext(CoupleContext);
  if (!ctx) throw new Error("useCouple must be used inside CoupleProvider");
  return ctx;
}
