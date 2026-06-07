"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getBillingState, startCheckout, type BillingState } from "@/app/(app)/profile/billing-actions";
import { usePreviewFree } from "@/lib/preview-tier";
import { BottomSheet } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";

export type PaywallReason =
  | "photos" | "albums" | "lists" | "folders" | "pots" | "calendar"
  | "history" | "themes" | "layout" | "generic";

const REASON_COPY: Record<PaywallReason, string> = {
  photos: "you've filled all 50 photos on the free plan.",
  albums: "free spaces include one photo album.",
  lists: "free spaces include 2 to-do lists.",
  folders: "free spaces keep the two starter folders.",
  pots: "free spaces include one savings pot.",
  calendar: "the free plan covers the current month — planning ahead is premium.",
  history: "looking back through your full history is a premium feature.",
  themes: "a custom banner is a little premium touch.",
  layout: "rearranging your home is a premium touch.",
  generic: "this is a premium feature.",
};

type EntitlementValue = {
  loading: boolean;
  premium: boolean;   // effective — honours the beta "preview as free" toggle
  paid: boolean;      // founding member
  comp: boolean;      // beta tester
  onTrial: boolean;
  refresh: () => void;
  openPaywall: (reason?: PaywallReason) => void;
};

const Ctx = createContext<EntitlementValue | null>(null);

const GOLD = "#F59E0B";
const GOLD_TINT = "rgba(245,158,11,0.10)";

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BillingState | null>(null);
  const previewFree = usePreviewFree();
  const [reason, setReason] = useState<PaywallReason | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => { getBillingState().then(setState).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // While entitlement is still loading, assume premium so entitled users (beta /
  // trial / paid — the vast majority) never flash the free experience or a
  // paywall. The server-side triggers backstop the brief window for real free
  // users. Once loaded, honour the real status (and the beta preview toggle).
  const premium = state === null ? true : (state.premium && !previewFree);
  const openPaywall = useCallback((r: PaywallReason = "generic") => setReason(r), []);

  async function subscribe(plan: "monthly" | "annual") {
    setBusy(true);
    try {
      const res = await startCheckout(plan);
      if (res.url) { window.location.href = res.url; return; }
    } catch { /* ignore */ }
    setBusy(false);
  }

  return (
    <Ctx.Provider
      value={{
        loading: state === null,
        premium,
        paid: state?.paid ?? false,
        comp: state?.comp ?? false,
        onTrial: state?.onTrial ?? false,
        refresh,
        openPaywall,
      }}
    >
      {children}

      <BottomSheet
        open={reason !== null}
        onClose={() => setReason(null)}
        title={<span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4" style={{ color: GOLD }} /> unlock premium</span>}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{REASON_COPY[reason ?? "generic"]}</p>
          <ul className="space-y-1.5">
            {["unlimited photos & vault", "plan any month ahead", "full history & archives", "themes & a custom banner"].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <span style={{ color: GOLD }}>✦</span>{f}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => subscribe("annual")} disabled={busy} className="relative rounded-xl border-2 p-3 text-left transition active:scale-[0.98] disabled:opacity-60" style={{ borderColor: GOLD, backgroundColor: GOLD_TINT }}>
              <span className="absolute -top-2 left-3 text-[9px] font-bold tracking-wide text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: GOLD }}>BEST VALUE</span>
              <p className="text-base font-bold text-foreground leading-none mt-1">£19.99<span className="text-xs font-normal text-muted-foreground">/yr</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">locks founding rate</p>
            </button>
            <button onClick={() => subscribe("monthly")} disabled={busy} className="rounded-xl border border-border p-3 text-left transition active:scale-[0.98] disabled:opacity-60">
              <p className="text-base font-bold text-foreground leading-none mt-1">£1.98<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">99p each</p>
            </button>
          </div>
          <button onClick={() => setReason(null)} className="w-full text-center text-xs text-muted-foreground/60 py-1">maybe later</button>
        </div>
      </BottomSheet>
    </Ctx.Provider>
  );
}

export function useEntitlement(): EntitlementValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEntitlement must be used within EntitlementProvider");
  return v;
}
