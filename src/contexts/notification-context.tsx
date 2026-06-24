"use client";

import { createContext, useContext, useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "./couple-context";
import { markSectionActivity } from "@/app/(app)/actions";

export type Section = "home" | "calendar" | "vault" | "ledger";

interface NotificationContextValue {
  badges: Record<Section, boolean>;
  markSeen: (section: Section) => void;
  markActivity: (section: Section) => void;
}

const Ctx = createContext<NotificationContextValue | null>(null);

const SECTIONS: Section[] = ["home", "calendar", "vault", "ledger"];

function lsGet(s: Section): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`us_seen_${s}`);
}
function lsSet(s: Section) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`us_seen_${s}`, new Date().toISOString());
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { coupleId, me } = useCouple();
  const [badges, setBadges] = useState<Record<Section, boolean>>({
    home: false, calendar: false, vault: false, ledger: false,
  });
  const [, startTransition] = useTransition();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.rpc("get_partner_profile", { p_couple_id: coupleId, p_my_id: me.id })
      .then(({ data }) => {
        const partner = data as { activity_at?: Record<string, string> } | null;
        if (!partner?.activity_at) return;
        setBadges((prev) => {
          const next = { ...prev };
          for (const s of SECTIONS) {
            const partnerAt = partner.activity_at![s];
            const lastSeen = lsGet(s);
            if (partnerAt && (!lastSeen || partnerAt > lastSeen)) next[s] = true;
          }
          return next;
        });
      });

    // Private channel — realtime.messages RLS (realtime_authz.sql) restricts this
    // topic to the couple's own members.
    const channel = supabase.channel(`notif-${coupleId}`, { config: { private: true } })
      .on("broadcast", { event: "activity" },
        ({ payload }: { payload: { section: Section; uid: string } }) => {
          if (payload.uid !== me.id) {
            setBadges((prev) => ({ ...prev, [payload.section]: true }));
          }
        })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [coupleId, me.id]);

  function markSeen(section: Section) {
    lsSet(section);
    setBadges((prev) => ({ ...prev, [section]: false }));
  }

  function markActivity(section: Section) {
    channelRef.current?.send({
      type: "broadcast", event: "activity",
      payload: { section, uid: me.id },
    });
    startTransition(() => { markSectionActivity(me.id, section); });
  }

  return <Ctx.Provider value={{ badges, markSeen, markActivity }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}
