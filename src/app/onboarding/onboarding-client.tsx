"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { saveProfile, createCouple, joinCouple, setOnboardingStartDate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Loader2, Heart, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { createClient } from "@/lib/supabase/client";

type Step = "profile" | "couple" | "start-date";
type Tab = "create" | "join";

interface Props {
  userId: string;
  firstName: string;
  avatar: string | null;
}

// ── Crop modal (avatar only) ───────────────────────────────────────────────
function CropModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const FRAME = { w: 260, h: 260 };
  const OUTPUT = { w: 800, h: 800 };
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  // Refs so native event handlers always see current values without re-registering
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const swRef = useRef(FRAME.w);
  const shRef = useRef(FRAME.h);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const baseScale = imgNatural ? Math.max(FRAME.w / imgNatural.w, FRAME.h / imgNatural.h) : 1;
  const scale = baseScale * zoom;
  const sw = imgNatural ? imgNatural.w * scale : FRAME.w;
  const sh = imgNatural ? imgNatural.h * scale : FRAME.h;

  // Keep refs in sync on every render
  zoomRef.current = zoom;
  offsetRef.current = offset;
  swRef.current = sw;
  shRef.current = sh;

  function clamp(ox: number, oy: number, w: number, h: number) {
    return {
      x: Math.min(0, Math.max(ox, FRAME.w - w)),
      y: Math.min(0, Math.max(oy, FRAME.h - h)),
    };
  }

  // Re-clamp offset whenever zoom changes so image never leaves frame
  useEffect(() => {
    if (!imgNatural) return;
    setOffset((prev) => clamp(prev.x, prev.y, swRef.current, shRef.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    setImgNatural(nat);
    const sc = Math.max(FRAME.w / nat.w, FRAME.h / nat.h);
    const initW = nat.w * sc;
    const initH = nat.h * sc;
    setOffset(clamp((FRAME.w - initW) / 2, (FRAME.h - initH) / 2, initW, initH));
  }

  // Non-passive touch + wheel listeners so we can call preventDefault
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
      if (e.touches.length === 1 && dragRef.current) {
        const d = dragRef.current;
        setOffset(clamp(
          d.ox + e.touches[0].clientX - d.startX,
          d.oy + e.touches[0].clientY - d.startY,
          swRef.current, shRef.current,
        ));
      } else if (e.touches.length === 2 && pinchRef.current) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        );
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
          pinchRef.current.startZoom * (dist / pinchRef.current.startDist),
        ));
        setZoom(newZoom);
      }
    }

    function onTouchEnd() { dragRef.current = null; pinchRef.current = null; }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.005)));
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []); // empty — all live values accessed via refs

  // Mouse drag (desktop)
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOffset(clamp(d.ox + e.clientX - d.startX, d.oy + e.clientY - d.startY, sw, sh));
  }
  function onMouseUp() { dragRef.current = null; }

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
          <p className="text-xs text-muted-foreground mt-0.5">drag to reposition · pinch or scroll to zoom</p>
        </div>
        <div className="flex justify-center">
          <div
            ref={containerRef}
            className="relative overflow-hidden bg-secondary cursor-grab active:cursor-grabbing select-none rounded-full"
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
              style={{ width: sw, height: sh, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          </div>
        </div>
        {/* Zoom slider */}
        <div className="px-1">
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-foreground"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-0.5 px-0.5">
            <span>zoom out</span>
            <span>zoom in</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1 h-11 rounded-xl">cancel</Button>
          <Button onClick={confirm} disabled={!imgNatural} className="flex-1 h-11 rounded-xl">use this</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function OnboardingClient({ userId, firstName, avatar }: Props) {
  const [step, setStep] = useState<Step>("profile");

  // Step 1
  const [name, setName] = useState(firstName);
  const [accentColor, setAccentColor] = useState("sage");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatar);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [tab, setTab] = useState<Tab>("create");
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 3
  const [startDate, setStartDate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAccent = ACCENT_COLORS.find((c) => c.name === accentColor) ?? ACCENT_COLORS[0];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    e.target.value = "";
  }

  function handleCropConfirm(blob: Blob) {
    setCroppedBlob(blob);
    setAvatarPreview(URL.createObjectURL(blob));
    setCropFile(null);
  }

  async function uploadAvatar(blob: Blob): Promise<string | null> {
    const supabase = createClient();
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (error) return null;
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    return publicUrl;
  }

  function handleProfileContinue() {
    if (!name.trim()) { setError("enter your name"); return; }
    setError(null);
    setStep("couple");
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const avatarUrl = croppedBlob ? await uploadAvatar(croppedBlob) : avatarPreview;
        await saveProfile({ userId, name, accentColor, avatarUrl });
        const result = await createCouple(userId);
        if ("error" in result) { setError(result.error ?? "something went wrong"); return; }
        setInviteCode(result.inviteCode);
        setCoupleId(result.coupleId);
        setStep("start-date");
      } catch (e) {
        setError(e instanceof Error ? e.message : "unexpected error");
      }
    });
  }

  function handleJoin() {
    if (!joinCode.trim()) return;
    setError(null);
    startTransition(async () => {
      const avatarUrl = croppedBlob ? await uploadAvatar(croppedBlob) : avatarPreview;
      await saveProfile({ userId, name, accentColor, avatarUrl });
      const result = await joinCouple(userId, joinCode);
      if (result?.error) setError(result.error);
    });
  }

  function copyCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    startTransition(async () => {
      if (startDate && coupleId) await setOnboardingStartDate(userId, coupleId, startDate);
      window.location.href = "/home";
    });
  }

  // ── Step 1: Profile setup ─────────────────────────────────────────────────
  if (step === "profile") {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
        {cropFile && (
          <CropModal
            file={cropFile}
            onConfirm={handleCropConfirm}
            onCancel={() => setCropFile(null)}
          />
        )}
        <div className="w-full max-w-sm space-y-7">
          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-24 h-24 rounded-full focus:outline-none group"
            >
              {avatarPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarPreview} alt="avatar" className="w-24 h-24 rounded-full object-cover" />
                  <div className="absolute inset-0 rounded-full bg-black/35 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[10px] text-white font-medium">change</span>
                  </div>
                </>
              ) : (
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 bg-secondary group-hover:bg-secondary/80 transition-colors">
                  <Camera className="w-6 h-6 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">add photo</span>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <div className="text-center">
              <h1 className="font-heading text-3xl text-foreground tracking-tight">welcome.</h1>
              <p className="text-muted-foreground text-sm mt-0.5">let&apos;s set you up.</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">what should we call you?</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="your first name"
              maxLength={30}
              className="h-12 rounded-xl bg-white border-border/60 text-base"
            />
          </div>

          {/* Accent colour */}
          <div>
            <label className="text-xs text-muted-foreground block mb-3">your colour</label>
            <div className="flex justify-center gap-4">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setAccentColor(c.name)}
                  className={cn(
                    "w-9 h-9 rounded-full border-2 transition-all",
                    accentColor === c.name ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button
            onClick={handleProfileContinue}
            className="w-full h-12 rounded-xl text-white"
            style={{ backgroundColor: selectedAccent.hex }}
          >
            continue →
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2: Couple setup ──────────────────────────────────────────────────
  if (step === "couple") {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="font-heading text-3xl text-foreground tracking-tight">your space.</h1>
            <p className="text-muted-foreground text-sm mt-0.5">create a shared space or join your partner&apos;s.</p>
          </div>

          <div className="flex bg-secondary rounded-2xl p-1">
            {(["create", "join"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-xl transition-all",
                  tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {t === "create" ? "create couple" : "join with code"}
              </button>
            ))}
          </div>

          {tab === "create" && (
            <div className="space-y-4">
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button
                onClick={handleCreate}
                disabled={isPending}
                className="w-full h-12 rounded-xl text-white"
                style={{ backgroundColor: selectedAccent.hex }}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create & get code"}
              </Button>
            </div>
          )}

          {tab === "join" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                enter the code your partner shared with you.
              </p>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toLowerCase())}
                placeholder="e.g. a3f92b1c"
                maxLength={8}
                className="h-12 rounded-xl text-center text-lg tracking-[0.3em] font-mono bg-white border-border/60"
              />
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button
                onClick={handleJoin}
                disabled={isPending || joinCode.length < 6}
                className="w-full h-12 rounded-xl gap-2 text-white"
                style={{ backgroundColor: selectedAccent.hex }}
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Heart className="w-4 h-4" /> join</>}
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => { setStep("profile"); setError(null); }}
            className="w-full text-xs text-muted-foreground/50 text-center"
          >
            ← back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Start date + invite code ─────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl text-foreground tracking-tight">your story.</h1>
          <p className="text-muted-foreground text-sm mt-0.5">almost done.</p>
        </div>

        {/* Start date */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">when did you get together?</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            className="w-full h-12 rounded-xl border border-border/60 bg-white px-4 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>

        {/* Invite code */}
        <div className="bg-white border border-border/60 rounded-2xl p-5 text-center shadow-card">
          <p className="text-xs text-muted-foreground mb-2">invite code for your partner</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-foreground mb-3">{inviteCode}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={copyCode}
            className="rounded-xl gap-2 border-border/60 h-9 text-xs"
          >
            {copied
              ? <><Check className="w-3.5 h-3.5 text-sage" /> copied!</>
              : <><Copy className="w-3.5 h-3.5" /> copy code</>
            }
          </Button>
        </div>

        <Button
          onClick={handleFinish}
          disabled={isPending}
          className="w-full h-12 rounded-xl text-white"
          style={{ backgroundColor: selectedAccent.hex }}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "continue to dashboard →"}
        </Button>

        {!startDate && (
          <button
            type="button"
            onClick={handleFinish}
            className="w-full text-xs text-muted-foreground/50 text-center"
          >
            skip for now
          </button>
        )}

        <p className="text-xs text-muted-foreground/40 text-center">
          your partner can join later using the code above.
        </p>
      </div>
    </div>
  );
}
