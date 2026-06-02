"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Camera, Check, LogOut, Lock, Bell, BellOff, Loader2, UserMinus, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { useCouple } from "@/contexts/couple-context";
import { updateDisplayName, updateAccentColor, updateAvatar, updateCoupleBanner, updateCoupleCurrency, updateCoupleBannerFocus, leaveCouple } from "./actions";

const CURRENCIES = ["£", "$", "€"] as const;
import { savePushSubscription } from "@/app/(app)/push-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import ThemeToggle from "@/components/theme-toggle";
import { BannerCondensed } from "@/components/banner-condensed";
import { cn } from "@/lib/utils";

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
  const FRAME = purpose === "avatar" ? { w: 260, h: 260 } : { w: 320, h: 160 };
  const OUTPUT = purpose === "avatar" ? { w: 800, h: 800 } : { w: 1600, h: 800 };
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
        const newOffset = clampOffset(offsetRef.current.x, offsetRef.current.y, newZoom, bw, bh);
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
  }, []);

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

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-5">
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
    </div>
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
      const permission = await Notification.requestPermission();
      setStatus(permission);
      if (permission === "granted") {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await savePushSubscription(userId, coupleId, sub.toJSON());
      }
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

export default function ProfileClient({
  initialProfile,
  initialCouple,
  partnerAccentColor,
}: {
  initialProfile: InitialProfile;
  initialCouple: InitialCouple;
  partnerAccentColor: string | null;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [couple, setCouple] = useState(initialCouple);
  const [nameDraft, setNameDraft] = useState(initialProfile.displayName);
  const [editingName, setEditingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [cropState, setCropState] = useState<{ file: File; purpose: "avatar" | "banner" } | null>(null);
  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const { currency: coupleCurrency, me } = useCouple();
  const [currency, setCurrency] = useState(coupleCurrency);
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  async function doUploadAvatar(blob: Blob) {
    setUploading("avatar");
    const supabase = createClient();
    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      setProfile((prev) => ({ ...prev, avatarUrl: publicUrl }));
      startTransition(async () => { await updateAvatar(profile.id, publicUrl); router.refresh(); });
    }
    setUploading(null);
  }

  async function doUploadBanner(blob: Blob) {
    setUploading("banner");
    const supabase = createClient();
    const path = `${profile.coupleId}/banner-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("banners").upload(path, blob, { contentType: "image/jpeg" });
    if (!error) {
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
      {cropState && (
        <CropModal
          file={cropState.file}
          purpose={cropState.purpose}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropState(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
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
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-muted-foreground">
              {profile.displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
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
            if (e.target.files?.[0]) { setCropState({ file: e.target.files[0], purpose: "avatar" }); e.target.value = ""; }
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

        {/* Banner upload */}
        <button
          onClick={() => bannerInputRef.current?.click()}
          disabled={uploading === "banner"}
          className="relative w-full h-32 bg-secondary overflow-hidden group block"
        >
          {couple.bannerUrl ? (
            <img src={couple.bannerUrl} alt="banner" className="w-full h-full object-cover" />
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
            if (e.target.files?.[0]) { setCropState({ file: e.target.files[0], purpose: "banner" }); e.target.value = ""; }
          }}
        />

        {/* Condensed-header crop — drag to choose which band of the photo shows */}
        {couple.bannerUrl && (
          <div className="px-4 py-3 border-t border-border/40">
            <p className="text-xs text-muted-foreground mb-2">condensed header — drag to position</p>
            <div className="rounded-xl overflow-hidden border border-border/40">
              <BannerCondensed bannerUrl={couple.bannerUrl} focus={bannerFocus} />
            </div>
            <input
              type="range" min={0} max={100} value={bannerFocus}
              onChange={(e) => handleBannerFocus(Number(e.target.value))}
              aria-label="banner vertical position"
              className="w-full mt-2.5 accent-foreground"
            />
          </div>
        )}

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

      {/* Appearance */}
      <ThemeToggle />

      {/* Notifications */}
      <NotificationSettings userId={profile.id} coupleId={profile.coupleId} />

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
          window.location.href = "/auth/login";
        }}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors"
      >
        <LogOut className="w-4 h-4" />
        sign out
      </button>

      <Dialog open={showLeave} onClose={() => { if (!leaving) setShowLeave(false); }}>
        <p className="font-semibold text-foreground text-center">leave this couple?</p>
        <p className="text-sm text-muted-foreground text-center mt-2 mb-5 leading-relaxed">
          you&apos;ll be able to create or join another space. your partner keeps the current space and everything in it.
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
