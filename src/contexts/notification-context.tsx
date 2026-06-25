"use client";

import { createContext, useContext, useState, useEffect, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCouple } from "./couple-context";
import { markSectionActivity } from "@/app/(app)/actions";
import { Dialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { enablePush } from "@/lib/push-client";

export type Section = "home" | "calendar" | "vault" | "ledger";

interface NotificationContextValue {
  badges: Record<Section, boolean>;
  markSeen: (section: Section) => void;
  markActivity: (section: Section) => void;
  nudgePush: () => void;
}

const NUDGE_KEY = "us_push_nudged";

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
  const { coupleId, me, partnerName } = useCouple();
  const [badges, setBadges] = useState<Record<Section, boolean>>({
    home: false, calendar: false, vault: false, ledger: false,
  });
  const [showNudge, setShowNudge] = useState(false);
  const [enabling, setEnabling] = useState(false);
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
    nudgePush();
  }

  // One-time prompt to turn on notifications, fired the first time the user does
  // something their partner is told about. No-op if already decided (granted or
  // denied) or already shown once.
  function nudgePush() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try { if (localStorage.getItem(NUDGE_KEY)) return; } catch { return; }
    setShowNudge(true);
  }

  function dismissNudge() {
    try { localStorage.setItem(NUDGE_KEY, "1"); } catch { /* storage unavailable */ }
    setShowNudge(false);
  }

  async function acceptNudge() {
    setEnabling(true);
    try { await enablePush(me.id, coupleId); } finally { setEnabling(false); dismissNudge(); }
  }

  return (
    <Ctx.Provider value={{ badges, markSeen, markActivity, nudgePush }}>
      {children}
      <Dialog open={showNudge} onClose={() => { if (!enabling) dismissNudge(); }}>
        <div className="w-12 h-12 rounded-full bg-sage/15 flex items-center justify-center mx-auto mb-3">
          <Bell className="w-5 h-5 text-sage" />
        </div>
        <p className="font-semibold text-foreground text-center">turn on notifications?</p>
        <p className="text-sm text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
          we&apos;ll gently let you know when {partnerName} checks in, leaves a note, or
          reaches out — so you never miss each other.
        </p>
        <div className="space-y-2">
          <Button onClick={acceptNudge} disabled={enabling} className="w-full h-11 rounded-xl">
            {enabling ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Bell className="w-4 h-4 mr-1.5" /> enable notifications</>}
          </Button>
          <button onClick={dismissNudge} disabled={enabling} className="w-full h-10 text-sm text-muted-foreground">not now</button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}
