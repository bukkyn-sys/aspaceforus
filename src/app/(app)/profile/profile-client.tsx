"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Camera, Check, LogOut, Lock, Bell, BellOff, Loader2, UserMinus, QrCode, Sparkles, FileText, Shield, ChevronRight, Download, Trash2 } from "lucide-react";
import { LegalSheet } from "@/components/legal-sheet";
import type { LegalDoc } from "@/lib/legal";
import { QRCodeSVG } from "qrcode.react";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { useCouple } from "@/contexts/couple-context";
import { updateDisplayName, updateAccentColor, updateAvatar, updateCoupleBanner, updateCoupleCurrency, updateCoupleBannerFocus, leaveCouple, exportMyData, deleteAccount, getServerConsent, setServerConsent } from "./actions";
import { getBillingState, startCheckout, startLifetimeCheckout, getLifetimeSpots, openBillingPortal, type BillingState } from "./billing-actions";
import { PremiumBadges } from "@/components/premium-badges";
import { useEntitlement } from "@/contexts/entitlement-context";

const CURRENCIES = ["£", "$", "€"] as const;
import { enablePush } from "@/lib/push-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import ThemeToggle from "@/components/theme-toggle";
import { SignedImg } from "@/components/signed-img";
import { validateImage } from "@/lib/validate-image";
import { clearCache } from "@/lib/data-cache";
import { getAnalyticsConsent, applyConsentChange } from "@/lib/analytics";
import { hapticsEnabled, setHapticsEnabled, haptic } from "@/lib/haptics";
import CalendarSubscribe from "@/components/calendar-subscribe";
import { cn } from "@/lib/utils";
import { isZoomEnabled, setZoomEnabled } from "@/components/zoom-pref";

interface InitialProfile {
  id: string;
  coupleId: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string;
}

interface InitialCouple {
  bannerUrl: string | null;
  inviteCode: string | null;
  bannerFocus: number;
}

function CropModal({
  file,
  purpose,
  onConfirm,
  onCancel,
}: {
  file: File;
  purpose: "avatar" | "banner";
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const FRAME = purpose === "avatar" ? { w: 260, h: 260 } : { w: 300, h: 100 };
  const OUTPUT = purpose === "avatar" ? { w: 800, h: 800 } : { w: 1500, h: 500 };
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  // Refs for use inside native event handlers
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const imgNaturalRef = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Keep refs in sync with state every render
  zoomRef.current = zoom;
  offsetRef.current = offset;
  baseScaleRef.current = baseScale;
  imgNaturalRef.current = imgNatural;

  // Fixed base dimensions at zoom=1; zoom applied via CSS transform
  const baseW = imgNatural ? imgNatural.w * baseScale : FRAME.w;
  const baseH = imgNatural ? imgNatural.h * baseScale : FRAME.h;

  function clampOffset(ox: number, oy: number, z: number, bw: number, bh: number) {
    return {
      x: Math.min(0, Math.max(ox, FRAME.w - bw * z)),
      y: Math.min(0, Math.max(oy, FRAME.h - bh * z)),
    };
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    const sc = Math.max(FRAME.w / nat.w, FRAME.h / nat.h);
    const bw = nat.w * sc;
    const bh = nat.h * sc;
    const init = clampOffset((FRAME.w - bw) / 2, (FRAME.h - bh) / 2, 1, bw, bh);
    setImgNatural(nat);
    setBaseScale(sc);
    setOffset(init);
    imgNaturalRef.current = nat;
    baseScaleRef.current = sc;
    offsetRef.current = init;
  }

  // Non-passive touch listeners so preventDefault stops page + modal scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length === 1) {
        const { x, y } = offsetRef.current;
        dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, ox: x, oy: y };
        pinchRef.current = null;
      } else if (e.touches.length === 2) {
        dragRef.current = null;
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        pinchRef.current = { startDist: dist, startZoom: zoomRef.current };
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const nat = imgNaturalRef.current;
      if (!nat) return;
      const bs = baseScaleRef.current;
      const bw = nat.w * bs;
      const bh = nat.h * bs;

      if (e.touches.length === 1 && dragRef.current) {
        const d = dragRef.current;
        const newOffset = clampOffset(
          d.ox + e.touches[0].clientX - d.startX,
          d.oy + e.touches[0].clientY - d.startY,
          zoomRef.current, bw, bh,
        );
        setOffset(newOffset);
        offsetRef.current = newOffset;
      } else if (e.touches.length === 2 && pinchRef.current) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
          pinchRef.current.startZoom * (dist / pinchRef.current.startDist),
        ));
        // Anchor the zoom to the centre of the crop frame so it grows from the
        // middle of the circle rather than the top-left corner.
        const z0 = zoomRef.current;
        const cx = FRAME.w / 2, cy = FRAME.h / 2;
        const ax = cx - ((cx - offsetRef.current.x) / z0) * newZoom;
        const ay = cy - ((cy - offsetRef.current.y) / z0) * newZoom;
        const newOffset = clampOffset(ax, ay, newZoom, bw, bh);
        setZoom(newZoom);
        setOffset(newOffset);
        zoomRef.current = newZoom;
        offsetRef.current = newOffset;
      }
    }

    function onTouchEnd() { dragRef.current = null; pinchRef.current = null; }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);

  // Mouse drag (desktop)
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOffset(clampOffset(d.ox + e.clientX - d.startX, d.oy + e.clientY - d.startY, zoom, baseW, baseH));
  }
  function onMouseUp() { dragRef.current = null; }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT.w;
    canvas.height = OUTPUT.h;
    const ctx = canvas.getContext("2d")!;
    if (imgRef.current && imgNatural) {
      const totalScale = baseScale * zoom;
      ctx.drawImage(
        imgRef.current,
        -offset.x / totalScale,
        -offset.y / totalScale,
        FRAME.w / totalScale,
        FRAME.h / totalScale,
        0, 0, OUTPUT.w, OUTPUT.h,
      );
    }
    canvas.toBlob((b) => { if (b) onConfirm(b); }, "image/jpeg", 0.92);
  }

  // Portal to <body> so the modal escapes the page-transition stacking context
  // (otherwise it renders *under* the fixed bottom nav and its buttons can't be tapped).
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center">
      <div
        className="bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-5"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div>
          <p className="font-semibold text-foreground">position photo</p>
          <p className="text-xs text-muted-foreground mt-0.5">drag to reposition · pinch to zoom</p>
        </div>
        <div className="flex justify-center">
          <div
            ref={containerRef}
            className={cn(
              "relative overflow-hidden bg-secondary cursor-grab active:cursor-grabbing select-none",
              purpose === "avatar" ? "rounded-full" : "rounded-2xl"
            )}
            style={{ width: FRAME.w, height: FRAME.h }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                width: baseW,
                height: baseH,
                transformOrigin: "0 0",
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1 h-11 rounded-xl">
            cancel
          </Button>
          <Button onClick={confirm} disabled={!imgNatural} className="flex-1 h-11 rounded-xl">
            use this
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NotificationSettings({ userId, coupleId }: { userId: string; coupleId: string }) {
  const [status, setStatus] = useState<NotificationPermission | "unsupported" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
    } else {
      setStatus(Notification.permission);
    }
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await enablePush(userId, coupleId);
      if (permission !== "unsupported") setStatus(permission);
    } finally {
      setBusy(false);
    }
  }

  if (status === null) return null;

  return (
    <div className="card p-4 mb-4">
      <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">notifications</p>
      {status === "granted" && (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Bell className="w-4 h-4 text-sage" />
          <span>push notifications enabled</span>
        </div>
      )}
      {status === "default" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BellOff className="w-4 h-4" />
            <span>notifications off</span>
          </div>
          <button
            onClick={enable}
            disabled={busy}
            className="text-xs font-medium text-foreground underline underline-offset-2"
          >
            {busy ? "enabling…" : "enable"}
          </button>
        </div>
      )}
      {status === "denied" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BellOff className="w-4 h-4" />
            <span>blocked by browser</span>
          </div>
          <p className="text-xs text-muted-foreground/60">
            go to your browser settings → site settings → notifications → allow for this site.
          </p>
        </div>
      )}
      {status === "unsupported" && (
        <p className="text-sm text-muted-foreground">not supported on this browser.</p>
      )}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ml-3", on ? "bg-sage" : "bg-foreground/15")}>
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", on ? "left-[1.15rem]" : "left-0.5")} />
    </span>
  );
}

function AccessibilitySettings() {
  const [zoomOn, setZoomOn] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [hapticsSupported, setHapticsSupported] = useState(false);
  useEffect(() => {
    setZoomOn(isZoomEnabled());
    setHapticsOn(hapticsEnabled());
    setHapticsSupported(typeof navigator !== "undefined" && typeof navigator.vibrate === "function");
  }, []);
  return (
    <div className="card p-4 mb-4">
      <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">preferences</p>
      <button
        onClick={() => { const next = !zoomOn; setZoomOn(next); setZoomEnabled(next); }}
        aria-pressed={zoomOn}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <p className="text-sm text-foreground">pinch to zoom</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">allow zooming anywhere in the app</p>
        </div>
        <Toggle on={zoomOn} />
      </button>
      {hapticsSupported && (
        <button
          onClick={() => { const next = !hapticsOn; setHapticsOn(next); setHapticsEnabled(next); if (next) haptic("light"); }}
          aria-pressed={hapticsOn}
          className="flex items-center justify-between w-full text-left mt-4"
        >
          <div>
            <p className="text-sm text-foreground">haptics</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">a gentle buzz on taps</p>
          </div>
          <Toggle on={hapticsOn} />
        </button>
      )}
    </div>
  );
}

// Days remaining (ceil) until an ISO timestamp.
function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

// Premium status + subscribe/manage, with a beta-only "preview as free" switch.
function BillingSettings() {
  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [spots, setSpots] = useState<number | null>(null);

  useEffect(() => { getBillingState().then(setState); getLifetimeSpots().then(setSpots).catch(() => {}); }, []);

  async function subscribe(plan: "monthly" | "annual") {
    setBusy(true); setErr(null);
    try {
      const r = await startCheckout(plan);
      if (r.url) { window.location.href = r.url; return; }
      setErr(r.error ?? "something went wrong");
    } catch (e) {
      setErr((e as Error)?.message ?? "something went wrong");
    } finally {
      setBusy(false);
    }
  }
  async function buyLifetime() {
    setBusy(true); setErr(null);
    try {
      const r = await startLifetimeCheckout();
      if (r.url) { window.location.href = r.url; return; }
      setErr(r.error ?? "something went wrong");
    } catch (e) {
      setErr((e as Error)?.message ?? "something went wrong");
    } finally {
      setBusy(false);
    }
  }
  async function manage() {
    setBusy(true); setErr(null);
    try {
      const r = await openBillingPortal();
      if (r.url) { window.location.href = r.url; return; }
      setErr(r.error ?? "something went wrong");
    } catch (e) {
      setErr((e as Error)?.message ?? "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const paid = !!state?.paid;
  const lifetime = !!state?.lifetime;
  const granted = !!state?.granted;
  const onTrial = !!state?.onTrial;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  // Gold framing via inline hex — the default Tailwind amber/yellow palette isn't
  // compiled in this project's theme, so palette classes would render nothing.
  const GOLD = "#F59E0B";
  const GOLD_TEXT = "#D97706";
  const GOLD_TINT = "rgba(245,158,11,0.10)";
  return (
    <div className="rounded-2xl p-[1.5px] mb-4 shadow-card" style={{ backgroundImage: "linear-gradient(135deg,#FBBF24,#F59E0B,#EAB308)" }}>
      <div className="rounded-2xl bg-card p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
          <p className="text-sm font-semibold text-foreground">us. premium</p>
          <span className="ml-auto">
            <PremiumBadges founding={state?.paid || state?.lifetime} />
          </span>
        </div>

        {state === null ? (
          <p className="text-sm text-muted-foreground/60">…</p>
        ) : lifetime ? (
          <p className="text-sm text-foreground">founding lifetime member — premium, forever. 💛</p>
        ) : paid ? (
          <>
            <p className="text-sm text-foreground">{state.plan === "annual" ? "annual plan" : "monthly plan"} · active</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.cancelAtPeriodEnd ? "ends" : "renews"} {fmt(state.currentPeriodEnd)}
            </p>
            <Button onClick={manage} disabled={busy} variant="outline" className="mt-3 w-full">manage subscription</Button>
          </>
        ) : granted ? (
          <p className="text-sm text-foreground">premium unlocked ✨</p>
        ) : (
          <>
            {onTrial ? (
              <p className="text-xs font-medium mb-1.5" style={{ color: GOLD_TEXT }}>
                {daysLeft(state.trialEndsAt)} days of premium left — keep it below.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              unlimited photos, plan any month ahead, full history, themes &amp; more — for the two of you.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {/* Annual — emphasised */}
              <button
                onClick={() => subscribe("annual")}
                disabled={busy}
                className="relative rounded-xl border-2 p-3 text-left transition active:scale-[0.98] disabled:opacity-60"
                style={{ borderColor: GOLD, backgroundColor: GOLD_TINT }}
              >
                <span className="absolute -top-2 left-3 text-[9px] font-bold tracking-wide text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: GOLD }}>BEST VALUE</span>
                <p className="text-base font-bold text-foreground leading-none mt-1">£29.99<span className="text-xs font-normal text-muted-foreground">/yr</span></p>
                <p className="text-[10px] text-muted-foreground mt-1">save 37% · locks rate</p>
              </button>

              {/* Monthly */}
              <button
                onClick={() => subscribe("monthly")}
                disabled={busy}
                className="rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.98] disabled:opacity-60"
              >
                <p className="text-base font-bold text-foreground leading-none mt-1">£3.99<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                <p className="text-[10px] text-muted-foreground mt-1">billed monthly · cancel anytime</p>
              </button>
            </div>

            {/* Founding lifetime — one-time, scarce. Hidden once sold out. */}
            {(spots === null || spots > 0) && (
              <button
                onClick={buyLifetime}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.98] disabled:opacity-60 flex items-center justify-between gap-2"
              >
                <div>
                  <p className="text-sm font-bold text-foreground leading-none">£49.99 <span className="text-xs font-normal text-muted-foreground">once · lifetime</span></p>
                  <p className="text-[10px] text-muted-foreground mt-1">founding member — pay once, premium forever</p>
                </div>
                {spots !== null && (
                  <span className="text-[10px] font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full" style={{ color: GOLD_TEXT, backgroundColor: GOLD_TINT }}>
                    {spots.toLocaleString("en-GB")} of 5,000 left
                  </span>
                )}
              </button>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2">one plan covers both of you · monthly may rise as we grow</p>
          </>
        )}

        {err && <p className="text-xs text-terracotta mt-2">{err}</p>}
      </div>
    </div>
  );
}

export default function ProfileClient({
  initialProfile,
  initialCouple,
}: {
  initialProfile: InitialProfile;
  initialCouple: InitialCouple;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [couple, setCouple] = useState(initialCouple);
  const [nameDraft, setNameDraft] = useState(initialProfile.displayName);
  const [editingName, setEditingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropState, setCropState] = useState<{ file: File; purpose: "avatar" | "banner" } | null>(null);
  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);
  useEffect(() => { setAnalyticsOn(getAnalyticsConsent() === "granted"); }, []);
  const [showQR, setShowQR] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const { currency: coupleCurrency, me, partner } = useCouple();
  const { premium, openPaywall } = useEntitlement();
  const [currency, setCurrency] = useState(coupleCurrency);
  // Partner's accent comes straight from context — no extra server fetch needed.
  const partnerAccentColor = partner?.accent_color ?? null;
  // Accent comes from the couple context (get_session_data returns accent_color);
  // the page's get_my_profile does NOT, so the prop would always read "sage".
  const [accent, setAccent] = useState(me.accent_color ?? initialProfile.accentColor ?? "sage");
  const [bannerFocus, setBannerFocus] = useState(initialCouple.bannerFocus);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleBannerFocus(v: number) {
    setBannerFocus(v);
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // debounce the save while dragging the slider
    focusTimer.current = setTimeout(() => {
      startTransition(async () => { await updateCoupleBannerFocus(profile.coupleId, profile.id, v); router.refresh(); });
    }, 450);
  }

  function handleCurrency(c: string) {
    setCurrency(c);
    // refresh so the layout's CoupleContext (read app-wide) picks up the change
    startTransition(async () => { await updateCoupleCurrency(profile.coupleId, profile.id, c); router.refresh(); });
  }

  async function handleLeaveCouple() {
    setLeaving(true);
    await leaveCouple(profile.id);
    window.location.href = "/onboarding";
  }

  async function handleExportData() {
    setExporting(true);
    try {
      const res = await exportMyData();
      if (res.error || !res.data) { alert("couldn't export your data — please try again"); return; }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `us-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    const res = await deleteAccount();
    if (res.error) { setDeleting(false); alert(`couldn't delete account: ${res.error}`); return; }
    clearCache();
    try { await createClient().auth.signOut(); } catch { /* session already gone */ }
    window.location.href = "/auth/login";
  }
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  async function doUploadAvatar(blob: Blob) {
    setUploading("avatar");
    setUploadError(null);
    const supabase = createClient();
    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (error) {
      setUploadError("photo upload failed — please try again");
    } else {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setProfile((prev) => ({ ...prev, avatarUrl: publicUrl }));
      startTransition(async () => { await updateAvatar(profile.id, publicUrl); router.refresh(); });
    }
    setUploading(null);
  }

  async function doUploadBanner(blob: Blob) {
    setUploading("banner");
    setUploadError(null);
    const supabase = createClient();
    const path = `${profile.coupleId}/banner-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("banners").upload(path, blob, { contentType: "image/jpeg" });
    if (error) {
      setUploadError("banner upload failed — please try again");
    } else {
      const { data: { publicUrl } } = supabase.storage.from("banners").getPublicUrl(path);
      setCouple((prev) => ({ ...prev, bannerUrl: publicUrl }));
      startTransition(async () => { await updateCoupleBanner(profile.coupleId, profile.id, publicUrl); router.refresh(); });
    }
    setUploading(null);
  }

  function handleCropConfirm(blob: Blob) {
    if (!cropState) return;
    setCropState(null);
    if (cropState.purpose === "avatar") doUploadAvatar(blob);
    else doUploadBanner(blob);
  }

  function saveName() {
    if (!nameDraft.trim()) return;
    const trimmed = nameDraft.trim();
    setProfile((prev) => ({ ...prev, displayName: trimmed }));
    setEditingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
    startTransition(async () => { await updateDisplayName(profile.id, trimmed); router.refresh(); });
  }

  function handleAccentColor(name: string) {
    setAccent(name);
    startTransition(async () => { await updateAccentColor(profile.id, name); router.refresh(); });
  }

  return (
    <div className="px-4 pt-10 pb-24 max-w-lg mx-auto">
      {uploadError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground text-xs font-medium px-4 py-2 rounded-xl shadow-lg" onClick={() => setUploadError(null)}>
          {uploadError}
        </div>
      )}
      {cropState && (
        <CropModal
          file={cropState.file}
          purpose={cropState.purpose}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropState(null)}
        />
      )}

      {/* Header */}
      <div className="hdr-float flex items-center gap-3 mb-8">
        <Link
          href="/home"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">profile.</h1>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <button
          onClick={() => avatarInputRef.current?.click()}
          disabled={uploading === "avatar"}
          className="relative w-24 h-24 rounded-full overflow-hidden bg-secondary mb-3 group"
        >
          <SignedImg
            src={profile.avatarUrl}
            alt=""
            className="w-full h-full object-cover"
            fallback={
              <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-muted-foreground">
                {profile.displayName?.[0]?.toUpperCase() ?? "?"}
              </div>
            }
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          {uploading === "avatar" && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            const err = validateImage(f);
            if (err) { setUploadError(err); return; }
            setUploadError(null); setCropState({ file: f, purpose: "avatar" });
          }}
        />
        <p className="text-xs text-muted-foreground">tap to change photo</p>
      </div>

      {/* Display name */}
      <div className="card p-4 mb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">display name</p>
        {editingName ? (
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="h-10 rounded-xl bg-secondary border-0 flex-1"
            />
            <button
              onClick={saveName}
              className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center flex-shrink-0"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center justify-between w-full group"
          >
            <span className="text-sm font-medium text-foreground">
              {profile.displayName || "tap to set name"}
            </span>
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              {nameSaved ? "saved ✓" : "edit"}
            </span>
          </button>
        )}
      </div>

      {/* Accent color */}
      <div className="card p-4 mb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide mb-3">your colour</p>
        <div className="flex justify-between">
          {ACCENT_COLORS.map((color) => {
            const isMine = accent === color.name;
            const isPartners = partnerAccentColor === color.name;
            return (
              <button
                key={color.name}
                onClick={() => !isPartners && handleAccentColor(color.name)}
                disabled={isPartners}
                className={cn(
                  "relative w-9 h-9 rounded-full transition-all flex items-center justify-center",
                  isMine && "ring-2 ring-offset-2 ring-foreground scale-110",
                  isPartners && "opacity-40 cursor-not-allowed",
                  !isMine && !isPartners && "opacity-70 hover:opacity-100"
                )}
                style={{ backgroundColor: color.hex }}
                title={isPartners ? "your partner's colour" : color.name}
              >
                {isMine && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                {isPartners && <Lock className="w-3 h-3 text-white/90" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
        {partnerAccentColor && (
          <p className="text-xs text-muted-foreground/50 mt-2">
            your partner already has{" "}
            {ACCENT_COLORS.find((c) => c.name === partnerAccentColor)?.name ?? partnerAccentColor}
          </p>
        )}
      </div>

      {/* Couple */}
      <div className="card overflow-hidden mb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide p-4 pb-3">couple</p>

        {/* Banner upload — custom banner is a premium touch */}
        <button
          onClick={() => { if (!premium) { openPaywall("themes"); return; } bannerInputRef.current?.click(); }}
          disabled={uploading === "banner"}
          className="relative w-full h-32 bg-secondary overflow-hidden group block"
        >
          {couple.bannerUrl ? (
            <SignedImg src={couple.bannerUrl} alt="banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
              <Camera className="w-5 h-5" />
              <p className="text-xs">add a couple photo</p>
            </div>
          )}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          {uploading === "banner" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            const err = validateImage(f);
            if (err) { setUploadError(err); return; }
            setUploadError(null); setCropState({ file: f, purpose: "banner" });
          }}
        />


        {/* Invite code */}
        {couple.inviteCode && (
          <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">invite code</p>
              <p className="font-mono text-sm font-semibold tracking-widest text-foreground">
                {couple.inviteCode}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" /> QR
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(couple.inviteCode!);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {codeCopied ? "copied!" : "copy"}
              </button>
            </div>
          </div>
        )}

        {/* Currency */}
        <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">currency</p>
            <p className="text-sm font-medium text-foreground">used for expenses &amp; new pots</p>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="currency">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => handleCurrency(c)}
                aria-pressed={currency === c}
                aria-label={`use ${c}`}
                className={cn(
                  "w-9 h-9 rounded-xl text-sm font-bold border transition-colors",
                  currency === c ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border/60"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invite QR */}
      <Dialog open={showQR} onClose={() => setShowQR(false)}>
        <div className="p-6 text-center">
          <p className="font-heading text-xl text-foreground tracking-tight mb-1">scan to join</p>
          <p className="text-sm text-muted-foreground mb-5">your partner can scan this to join you.</p>
          {couple.inviteCode && origin && (
            <div className="inline-flex p-4 bg-card rounded-2xl border border-border/40 mb-4">
              <QRCodeSVG value={`${origin}/join?code=${couple.inviteCode}`} size={200} bgColor="#ffffff" fgColor="#2C2C2B" level="M" />
            </div>
          )}
          <p className="font-mono text-lg font-semibold tracking-[0.25em] text-foreground">{couple.inviteCode}</p>
        </div>
      </Dialog>

      {/* Premium */}
      <BillingSettings />

      {/* Appearance */}
      <ThemeToggle />

      {/* Notifications */}
      <NotificationSettings userId={profile.id} coupleId={profile.coupleId} />

      {/* Accessibility */}
      <AccessibilitySettings />

      {/* About & legal */}
      <div className="card overflow-hidden mb-4">
        <p className="text-xs text-muted-foreground font-medium tracking-wide p-4 pb-3">about &amp; legal</p>
        <button
          onClick={() => setLegalDoc("privacy")}
          className="w-full flex items-center gap-3 px-4 py-3 border-t border-border/40 text-left active:bg-black/[0.02] transition-colors"
        >
          <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
          <span className="text-sm text-foreground flex-1">privacy policy</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
        </button>
        <button
          onClick={() => setLegalDoc("terms")}
          className="w-full flex items-center gap-3 px-4 py-3 border-t border-border/40 text-left active:bg-black/[0.02] transition-colors"
        >
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
          <span className="text-sm text-foreground flex-1">terms of service</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
        </button>
      </div>

      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />

      {/* Leave couple */}
      <button
        onClick={() => setShowLeave(true)}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors mt-2"
      >
        <UserMinus className="w-4 h-4" />
        leave couple
      </button>

      {/* Sign out */}
      <button
        onClick={async () => {
          const s = createClient();
          await s.auth.signOut();
          clearCache(); // wipe couple data so it can't be read after logout (shared device)
          window.location.href = "/auth/login";
        }}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors"
      >
        <LogOut className="w-4 h-4" />
        sign out
      </button>

      {/* Subscribe Apple/Google calendar to the couple's events (one-way .ics) */}
      <CalendarSubscribe />

      {/* Your data — analytics consent + GDPR export + account deletion */}
      <div className="mt-6 pt-4 border-t border-border/40">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/50 px-4 mb-1">your data</p>
        <button
          onClick={() => {
            const next = analyticsOn ? "denied" : "granted";
            applyConsentChange(next, { id: me.id, couple_id: me.couple_id, accent_color: me.accent_color });
            setServerConsent(next);
            setAnalyticsOn(next === "granted");
          }}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
        >
          <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> product analytics</span>
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", analyticsOn ? "bg-sage/20 text-sage" : "bg-secondary text-muted-foreground")}>
            {analyticsOn ? "on" : "off"}
          </span>
        </button>
        <button
          onClick={handleExportData}
          disabled={exporting}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-60"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          download my data
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          delete my account
        </button>
      </div>

      <Dialog open={showDelete} onClose={() => { if (!deleting) setShowDelete(false); }}>
        <p className="font-semibold text-foreground text-center">delete your account?</p>
        <p className="text-sm text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
          this permanently deletes your account and personal data. if you have a partner, your shared items pass to them so their space keeps working; if you&apos;re on your own, the space and its contents are deleted. this can&apos;t be undone.
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4 mr-1.5" /> delete account</>}
          </Button>
          <button onClick={() => setShowDelete(false)} disabled={deleting} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
        </div>
      </Dialog>

      <Dialog open={showLeave} onClose={() => { if (!leaving) setShowLeave(false); }}>
        <p className="font-semibold text-foreground text-center">leave this couple?</p>
        <p className="text-sm text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
          you&apos;ll be able to create or join another space. your partner keeps the current space, and your items will remain in the space.
        </p>
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={handleLeaveCouple}
            disabled={leaving}
            className="w-full h-11 rounded-xl text-terracotta border-terracotta/30 hover:bg-terracotta-light"
          >
            {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserMinus className="w-4 h-4 mr-1.5" /> leave couple</>}
          </Button>
          <button onClick={() => setShowLeave(false)} disabled={leaving} className="w-full h-10 text-sm text-muted-foreground">cancel</button>
        </div>
      </Dialog>
    </div>
  );
}
