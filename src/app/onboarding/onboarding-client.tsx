"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { saveProfile, createCouple, joinCouple, setOnboardingStartDate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Loader2, Heart, Camera, ArrowLeft, Home, CalendarDays, Bookmark, Receipt, Smartphone, Share, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { createClient } from "@/lib/supabase/client";

type Step = "welcome" | "pillars" | "name" | "photo" | "colour" | "couple" | "finish" | "install";
type Tab = "create" | "join";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// "Add to home screen" step. Uses the native install prompt on Android/Chrome,
// shows the Share → Add to Home Screen steps on iOS, and is always skippable.
function InstallStep({
  prompt, accentHex, onDone, onBack,
}: {
  prompt: BeforeInstallPromptEvent | null;
  accentHex: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setDone(true);
  }

  // Already installed — nothing to do.
  if (standalone) {
    return (
      <div className="min-h-dvh bg-background flex flex-col px-6 pt-8 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm w-full mx-auto">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7" style={{ backgroundColor: `${accentHex}22` }}>
            <Check className="w-9 h-9" strokeWidth={1.5} style={{ color: accentHex }} />
          </div>
          <h1 className="font-heading text-3xl text-foreground tracking-tight">you&apos;re all set.</h1>
          <p className="text-[15px] text-muted-foreground mt-3">enjoy your shared space.</p>
        </div>
        <div className="max-w-sm w-full mx-auto">
          <Button onClick={onDone} className="w-full h-12 rounded-xl text-white text-[15px] font-medium" style={{ backgroundColor: accentHex }}>enter your space</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col px-6 pt-8 pb-10">
      <div className="h-8 max-w-sm w-full mx-auto flex items-center">
        {onBack && (
          <button onClick={onBack} className="w-8 h-8 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm w-full mx-auto pb-8">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7" style={{ backgroundColor: `${accentHex}22` }}>
          <Smartphone className="w-9 h-9" strokeWidth={1.5} style={{ color: accentHex }} />
        </div>
        <h1 className="font-heading text-3xl text-foreground tracking-tight">add us. to your home screen</h1>
        <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed">
          so it&apos;s one tap away and feels like a real app — no app store needed.
        </p>

        {isIOS && !prompt && (
          <div className="mt-7 w-full bg-white border border-border/50 rounded-2xl p-4 text-left shadow-card space-y-2.5">
            <div className="flex items-start gap-2.5 text-sm text-foreground">
              <Share className="w-4 h-4 flex-shrink-0 text-muted-foreground mt-0.5" />
              <span>tap the <span className="font-medium">share</span> icon in safari</span>
            </div>
            <div className="flex items-start gap-2.5 text-sm text-foreground">
              <Plus className="w-4 h-4 flex-shrink-0 text-muted-foreground mt-0.5" />
              <span>choose <span className="font-medium">add to home screen</span> — you may need to scroll down or tap <span className="font-medium">more</span></span>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-sm w-full mx-auto space-y-3">
        {prompt && !done && (
          <Button onClick={install} className="w-full h-12 rounded-xl text-white text-[15px] font-medium" style={{ backgroundColor: accentHex }}>
            <Plus className="w-4 h-4 mr-1" /> add to home screen
          </Button>
        )}
        <Button
          onClick={onDone}
          variant={prompt && !done ? "outline" : "default"}
          className={cn("w-full h-12 rounded-xl text-[15px] font-medium", !(prompt && !done) && "text-white")}
          style={!(prompt && !done) ? { backgroundColor: accentHex } : undefined}
        >
          {done ? "enter your space" : prompt ? "maybe later" : "enter your space"}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  firstName: string;
  avatar: string | null;
}

const PILLARS = [
  { icon: Home,         name: "home",     color: "#7C9E87", blurb: "your shared dashboard — moods, a little love-note, and countdowns to what's coming up." },
  { icon: CalendarDays, name: "calendar", color: "#5B9BD5", blurb: "mark when you're each free, spot your overlaps, and plan dates, trips and events." },
  { icon: Bookmark,     name: "vault",    color: "#8B7BB8", blurb: "keep date ideas, wishlists and everything you want to do together in one place." },
  { icon: Receipt,      name: "ledger",   color: "#C4704F", blurb: "split shared expenses fairly and save towards goals with savings pots." },
];

// Consistent layout for the step-by-step setup screens.
function SetupShell({
  index, total, onBack, title, subtitle, children, footer,
}: {
  index: number;
  total: number;
  onBack?: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background flex flex-col px-6 pt-8 pb-10">
      <div className="flex items-center justify-between h-8 max-w-sm w-full mx-auto">
        {onBack ? (
          <button onClick={onBack} className="w-8 h-8 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-7" />}
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-foreground" : "w-1.5 bg-border")} />
          ))}
        </div>
        <div className="w-7" />
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto pb-8">
        <h1 className="font-heading text-3xl text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1.5 mb-8">{subtitle}</p>}
        {!subtitle && <div className="mb-8" />}
        {children}
      </div>

      <div className="max-w-sm w-full mx-auto space-y-3">{footer}</div>
    </div>
  );
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
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  // Refs for use inside native event handlers (always current without re-registering)
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

  // Keep refs in sync with state (runs every render, before effects)
  zoomRef.current = zoom;
  offsetRef.current = offset;
  baseScaleRef.current = baseScale;
  imgNaturalRef.current = imgNatural;

  // Fixed base dimensions (zoom=1). Zoom is applied via CSS transform, not by resizing.
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

  // Non-passive touch listeners so preventDefault stops page scroll
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
  }, []); // empty — all live values accessed via refs

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
      // Map the visible frame area back to natural image coordinates
      const totalScale = baseScale * zoom;
      ctx.drawImage(
        imgRef.current,
        -offset.x / totalScale,    // source x (natural px)
        -offset.y / totalScale,    // source y (natural px)
        FRAME.w / totalScale,      // source width (natural px)
        FRAME.h / totalScale,      // source height (natural px)
        0, 0, OUTPUT.w, OUTPUT.h,  // dest: full 800×800 canvas
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
          <Button variant="outline" onClick={onCancel} className="flex-1 h-11 rounded-xl">cancel</Button>
          <Button onClick={confirm} disabled={!imgNatural} className="flex-1 h-11 rounded-xl">use this</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function OnboardingClient({ userId, firstName, avatar }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [pillar, setPillar] = useState(0);

  // Profile
  const [name, setName] = useState(firstName);
  const [accentColor, setAccentColor] = useState("sage");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatar);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Couple
  const [tab, setTab] = useState<Tab>("create");
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Finish
  const [startDate, setStartDate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Capture the install prompt early so it's ready by the install step.
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

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
        setStep("finish");
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
      if (result?.error) { setError(result.error); return; }
      setStep("install");
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
      setStep("install");
    });
  }

  const accentBtn = "w-full h-12 rounded-xl text-white text-[15px] font-medium";

  // ── Welcome ───────────────────────────────────────────────────────────────
  if (step === "welcome") {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="font-heading text-7xl text-foreground tracking-tight">us.</h1>
          <p className="text-muted-foreground mt-3 text-base">a little home for the two of you.</p>
          <p className="text-sm text-muted-foreground/70 mt-6 max-w-[16rem] leading-relaxed">
            moods, plans, ideas and money — kept in one calm, shared space.
          </p>
        </div>
        <div className="w-full max-w-sm pb-10">
          <Button onClick={() => setStep("pillars")} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>
            take a look around
          </Button>
        </div>
      </div>
    );
  }

  // ── Pillars tour ──────────────────────────────────────────────────────────
  if (step === "pillars") {
    const p = PILLARS[pillar];
    const Icon = p.icon;
    return (
      <div className="min-h-dvh bg-background flex flex-col px-6 pt-8 pb-10">
        <div className="flex items-center justify-between h-8 max-w-sm w-full mx-auto">
          <button
            onClick={() => pillar > 0 ? setPillar(pillar - 1) : setStep("welcome")}
            className="w-8 h-8 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-1.5">
            {PILLARS.map((_, i) => (
              <div key={i} className={cn("h-1.5 rounded-full transition-all", i === pillar ? "w-5" : "w-1.5 bg-border")}
                style={i === pillar ? { backgroundColor: p.color } : undefined} />
            ))}
          </div>
          <button onClick={() => setStep("name")} className="text-xs text-muted-foreground/60 hover:text-muted-foreground">skip</button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm w-full mx-auto pb-8">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7" style={{ backgroundColor: `${p.color}22` }}>
            <Icon className="w-9 h-9" strokeWidth={1.5} style={{ color: p.color }} />
          </div>
          <h1 className="font-heading text-4xl text-foreground tracking-tight">{p.name}.</h1>
          <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed max-w-[18rem]">{p.blurb}</p>
        </div>

        <div className="max-w-sm w-full mx-auto">
          <Button
            onClick={() => pillar < PILLARS.length - 1 ? setPillar(pillar + 1) : setStep("name")}
            className="w-full h-12 rounded-xl text-white text-[15px] font-medium"
            style={{ backgroundColor: p.color }}
          >
            {pillar < PILLARS.length - 1 ? "next" : "set up your space"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Name ──────────────────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <SetupShell
        index={0} total={4}
        onBack={() => { setPillar(PILLARS.length - 1); setStep("pillars"); }}
        title="what's your name?"
        subtitle="so your partner always knows it's you."
        footer={
          <Button onClick={() => setStep("photo")} disabled={!name.trim()} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>
            continue
          </Button>
        }
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your first name"
          maxLength={30}
          autoFocus
          className="h-12 rounded-xl bg-white border-border/60 text-base"
        />
      </SetupShell>
    );
  }

  // ── Photo ─────────────────────────────────────────────────────────────────
  if (step === "photo") {
    return (
      <>
        {cropFile && <CropModal file={cropFile} onConfirm={handleCropConfirm} onCancel={() => setCropFile(null)} />}
        <SetupShell
          index={1} total={4}
          onBack={() => setStep("name")}
          title="add a photo"
          subtitle="optional — it helps your space feel like yours. you can change it later."
          footer={
            <>
              <Button onClick={() => setStep("colour")} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>continue</Button>
              {!avatarPreview && (
                <button onClick={() => setStep("colour")} className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground">skip for now</button>
              )}
            </>
          }
        >
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-28 h-28 rounded-full focus:outline-none group"
            >
              {avatarPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarPreview} alt="avatar" className="w-28 h-28 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${selectedAccent.hex}` }} />
                  <div className="absolute inset-0 rounded-full bg-black/35 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[10px] text-white font-medium">change</span>
                  </div>
                </>
              ) : (
                <div className="w-28 h-28 rounded-full border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 bg-secondary group-hover:bg-secondary/80 transition-colors">
                  <Camera className="w-7 h-7 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">add photo</span>
                </div>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        </SetupShell>
      </>
    );
  }

  // ── Colour ────────────────────────────────────────────────────────────────
  if (step === "colour") {
    return (
      <SetupShell
        index={2} total={4}
        onBack={() => setStep("photo")}
        title="pick your colour"
        subtitle="this is how you'll show up across your shared space."
        footer={
          <Button onClick={() => setStep("couple")} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>continue</Button>
        }
      >
        {/* Preview */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-secondary flex items-center justify-center" style={{ boxShadow: `0 0 0 3px ${selectedAccent.hex}` }}>
            {avatarPreview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
              : <span className="text-2xl font-semibold text-muted-foreground">{(name[0] ?? "?").toUpperCase()}</span>}
          </div>
        </div>
        <div className="flex justify-center gap-3.5">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setAccentColor(c.name)}
              className={cn("w-10 h-10 rounded-full border-2 transition-all", accentColor === c.name ? "border-foreground scale-110" : "border-transparent")}
              style={{ backgroundColor: c.hex }}
              aria-label={c.name}
            />
          ))}
        </div>
      </SetupShell>
    );
  }

  // ── Couple ────────────────────────────────────────────────────────────────
  if (step === "couple") {
    return (
      <SetupShell
        index={3} total={4}
        onBack={() => setStep("colour")}
        title="your shared space"
        subtitle="start a new space, or join the one your partner already made."
        footer={
          tab === "create" ? (
            <Button onClick={handleCreate} disabled={isPending} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create our space"}
            </Button>
          ) : (
            <Button onClick={handleJoin} disabled={isPending || joinCode.length < 6} className={cn(accentBtn, "gap-2")} style={{ backgroundColor: selectedAccent.hex }}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Heart className="w-4 h-4" /> join</>}
            </Button>
          )
        }
      >
        <div className="flex bg-secondary rounded-2xl p-1 mb-5">
          {(["create", "join"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={cn("flex-1 py-2 text-sm font-medium rounded-xl transition-all", tab === t ? "bg-white text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {t === "create" ? "create" : "join with code"}
            </button>
          ))}
        </div>

        {tab === "create" ? (
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            we&apos;ll create your space and give you a code to share with your partner so they can join.
          </p>
        ) : (
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toLowerCase())}
            placeholder="paste your code"
            maxLength={8}
            className="h-12 rounded-xl text-center text-lg tracking-[0.3em] font-mono bg-white border-border/60"
          />
        )}
        {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
      </SetupShell>
    );
  }

  // ── Add to home screen ────────────────────────────────────────────────────
  if (step === "install") {
    return (
      <InstallStep
        prompt={installPrompt}
        accentHex={selectedAccent.hex}
        onDone={() => { window.location.href = "/home"; }}
        onBack={inviteCode ? () => setStep("finish") : undefined}
      />
    );
  }

  // ── Finish (after create) ─────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col px-6 pt-8 pb-10">
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
        <h1 className="font-heading text-3xl text-foreground tracking-tight">you&apos;re all set.</h1>
        <p className="text-sm text-muted-foreground mt-1.5 mb-8">two last touches — both optional.</p>

        {/* Start date */}
        <div className="mb-5">
          <label className="text-xs text-muted-foreground block mb-1.5">when did you get together?</label>
          <div className="h-12 rounded-xl border border-border/60 bg-white overflow-hidden flex items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full min-w-0 box-border bg-transparent px-4 text-sm text-foreground appearance-none focus:outline-none"
            />
          </div>
        </div>

        {/* Invite code */}
        <div className="bg-white border border-border/60 rounded-2xl p-5 text-center shadow-card">
          <p className="text-xs text-muted-foreground mb-2">share this code so your partner can join</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-foreground mb-3">{inviteCode}</p>
          <Button variant="outline" size="sm" onClick={copyCode} className="rounded-xl gap-2 border-border/60 h-9 text-xs">
            {copied ? <><Check className="w-3.5 h-3.5 text-sage" /> copied!</> : <><Copy className="w-3.5 h-3.5" /> copy code</>}
          </Button>
        </div>
      </div>

      <div className="max-w-sm w-full mx-auto">
        <Button onClick={handleFinish} disabled={isPending} className={accentBtn} style={{ backgroundColor: selectedAccent.hex }}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "continue"}
        </Button>
      </div>
    </div>
  );
}
