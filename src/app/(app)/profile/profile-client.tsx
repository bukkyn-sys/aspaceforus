"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Camera, Check, LogOut, X, Bell, BellOff } from "lucide-react";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { updateDisplayName, updateAccentColor, updateAvatar, updateCoupleBanner } from "./actions";
import { savePushSubscription } from "@/app/(app)/push-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const scale = imgNatural ? Math.max(FRAME.w / imgNatural.w, FRAME.h / imgNatural.h) : 1;
  const sw = imgNatural ? imgNatural.w * scale : FRAME.w;
  const sh = imgNatural ? imgNatural.h * scale : FRAME.h;

  function clamp(ox: number, oy: number) {
    return {
      x: Math.min(0, Math.max(ox, FRAME.w - sw)),
      y: Math.min(0, Math.max(oy, FRAME.h - sh)),
    };
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    setImgNatural(nat);
    const sc = Math.max(FRAME.w / nat.w, FRAME.h / nat.h);
    setOffset(clamp((FRAME.w - nat.w * sc) / 2, (FRAME.h - nat.h * sc) / 2));
  }

  function startDrag(x: number, y: number) {
    dragRef.current = { startX: x, startY: y, ox: offset.x, oy: offset.y };
  }

  function moveDrag(x: number, y: number) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOffset(clamp(d.ox + x - d.startX, d.oy + y - d.startY));
  }

  function endDrag() { dragRef.current = null; }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT.w;
    canvas.height = OUTPUT.h;
    const ctx = canvas.getContext("2d")!;
    if (imgRef.current) {
      const sx = OUTPUT.w / FRAME.w;
      const sy = OUTPUT.h / FRAME.h;
      ctx.drawImage(imgRef.current, offset.x * sx, offset.y * sy, sw * sx, sh * sy);
    }
    canvas.toBlob((b) => { if (b) onConfirm(b); }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center">
      <div className="bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm p-6 space-y-5">
        <div>
          <p className="font-semibold text-foreground">position photo</p>
          <p className="text-xs text-muted-foreground mt-0.5">drag to choose what shows</p>
        </div>
        <div className="flex justify-center">
          <div
            className={cn(
              "relative overflow-hidden bg-secondary touch-none cursor-grab active:cursor-grabbing select-none",
              purpose === "avatar" ? "rounded-full" : "rounded-2xl"
            )}
            style={{ width: FRAME.w, height: FRAME.h }}
            onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
            onMouseMove={(e) => { if (dragRef.current) moveDrag(e.clientX, e.clientY); }}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchEnd={endDrag}
          >
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ width: sw, height: sh, transform: `translate(${offset.x}px, ${offset.y}px)` }}
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
    <div className="bg-white border border-border/50 rounded-3xl p-4 shadow-card mb-4">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">notifications</p>
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
          <p className="text-[11px] text-muted-foreground/60">
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
  const [, startTransition] = useTransition();
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
      startTransition(() => { updateAvatar(profile.id, publicUrl); });
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
      startTransition(() => { updateCoupleBanner(profile.coupleId, profile.id, publicUrl); });
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
    startTransition(() => { updateDisplayName(profile.id, trimmed); });
  }

  function handleAccentColor(name: string) {
    setProfile((prev) => ({ ...prev, accentColor: name }));
    startTransition(() => { updateAccentColor(profile.id, name); });
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
            <div className="w-full h-full flex items-center justify-center font-heading text-3xl text-muted-foreground">
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
      <div className="bg-white border border-border/50 rounded-3xl p-4 shadow-card mb-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">display name</p>
        {editingName ? (
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="h-10 rounded-xl bg-secondary border-0 flex-1"
              autoFocus
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
      <div className="bg-white border border-border/50 rounded-3xl p-4 shadow-card mb-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">your colour</p>
        <div className="flex gap-3">
          {ACCENT_COLORS.map((color) => {
            const isMine = profile.accentColor === color.name;
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
                {isPartners && <X className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        {partnerAccentColor && (
          <p className="text-[10px] text-muted-foreground/50 mt-2">
            your partner already has{" "}
            {ACCENT_COLORS.find((c) => c.name === partnerAccentColor)?.name ?? partnerAccentColor}
          </p>
        )}
      </div>

      {/* Couple */}
      <div className="bg-white border border-border/50 rounded-3xl overflow-hidden shadow-card mb-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider p-4 pb-3">couple</p>

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

        {/* Invite code */}
        {couple.inviteCode && (
          <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">invite code</p>
              <p className="font-mono text-sm font-semibold tracking-widest text-foreground">
                {couple.inviteCode}
              </p>
            </div>
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
        )}
      </div>

      {/* Notifications */}
      <NotificationSettings userId={profile.id} coupleId={profile.coupleId} />

      {/* Sign out */}
      <button
        onClick={async () => {
          const s = createClient();
          await s.auth.signOut();
          window.location.href = "/auth/login";
        }}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm text-muted-foreground hover:text-terracotta hover:bg-terracotta-light transition-colors mt-2"
      >
        <LogOut className="w-4 h-4" />
        sign out
      </button>
    </div>
  );
}
