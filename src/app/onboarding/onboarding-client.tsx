"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { saveProfile, createCouple, joinCouple, setOnboardingStartDate } from "./actions";
import { startCheckout, redeemBetaCode } from "@/app/(app)/profile/billing-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Loader2, Heart, Camera, ArrowLeft, Smartphone, Share, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_COLORS } from "@/lib/accent-colors";
import { createClient } from "@/lib/supabase/client";
import { validateImage } from "@/lib/validate-image";
import { SignedImg } from "@/components/signed-img";
import { DateField } from "@/components/ui/date-field";
import { QRCodeSVG } from "qrcode.react";
import ThemeToggle from "@/components/theme-toggle";

type Step = "welcome" | "pillars" | "name" | "photo" | "colour" | "couple" | "finish" | "plan" | "install";
type Tab = "create" | "join";

const EASE = [0.22, 1, 0.36, 1] as const;

// Direction-aware page transition (forward slides in from the right).
const screenVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};

// Staggered reveal for the richer "marketing" screens.
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } } };
const rise: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } };

// Soft, slowly-drifting accent glow behind everything. We animate only
// translate (never scale/opacity on a blurred layer — that makes the browser
// re-rasterise the blur and flash a hard-edged box) and promote each blob to
// its own GPU layer with translateZ so the blur stays clipped and smooth.
function Ambient({ accent }: { accent: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
      <motion.div
        className="absolute -top-28 -right-20 w-72 h-72 rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: 0.26, willChange: "transform", transform: "translateZ(0)" }}
        animate={{ x: [0, 22, 0], y: [0, 26, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -left-24 w-80 h-80 rounded-full blur-3xl"
        style={{ backgroundColor: accent, opacity: 0.16, willChange: "transform", transform: "translateZ(0)" }}
        animate={{ x: [0, -18, 0], y: [0, -22, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

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
      <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm w-full mx-auto">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-7" style={{ backgroundColor: `${accentHex}22` }}>
            <Check className="w-9 h-9" strokeWidth={1.5} style={{ color: accentHex }} />
          </div>
          <h1 className="font-heading text-3xl text-foreground tracking-tight">you&apos;re installed.</h1>
          <p className="text-[15px] text-muted-foreground mt-3">let&apos;s set things up.</p>
        </div>
        <div className="max-w-sm w-full mx-auto">
          <Button onClick={onDone} className="w-full h-12 rounded-xl text-white text-[15px] font-medium" style={{ backgroundColor: accentHex }}>continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
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
          <div className="mt-7 w-full bg-card border border-border/50 rounded-2xl p-4 text-left shadow-card space-y-2.5">
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
          {done ? "continue" : prompt ? "maybe later" : "continue"}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  firstName: string;
  avatar: string | null;
  initialInvite?: string | null;
}

// The app deliberately has no single brand colour — pre-colour screens use ink.
const NEUTRAL_INK = "#2C2C2B";
const NEUTRAL_GLOW = "#CFC9BE";

const PILLARS = [
  { name: "home",     color: "#7C9E87", blurb: "your shared dashboard — moods, a little love-note, and countdowns to what's coming up." },
  { name: "calendar", color: "#5B9BD5", blurb: "mark when you're each free, spot your overlaps, and plan dates, trips and events." },
  { name: "vault",    color: "#8B7BB8", blurb: "keep date ideas, wishlists and everything you want to do together in one place." },
  { name: "ledger",   color: "#C4704F", blurb: "split shared expenses fairly and save towards goals with savings pots." },
];

// Small, tasteful "preview of the page" illustrations (no generic icons).
function PillarArt({ kind, color }: { kind: string; color: string }) {
  const card = "rounded-2xl bg-card border border-border/50 shadow-card";

  if (kind === "calendar") {
    return (
      <motion.div variants={stagger} initial="hidden" animate="show" className={cn(card, "w-44 p-3")}>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }).map((_, i) => {
            const accent = [6, 7].includes(i);
            const today = i === 12;
            return (
              <motion.div
                key={i}
                variants={rise}
                className="aspect-square rounded-[4px]"
                style={{ backgroundColor: today ? color : accent ? `${color}40` : "var(--secondary)" }}
              />
            );
          })}
        </div>
      </motion.div>
    );
  }

  if (kind === "vault") {
    return (
      <motion.div variants={stagger} initial="hidden" animate="show" className="w-44 space-y-2">
        {[0, 1, 2].map((i) => (
          <motion.div key={i} variants={rise} className={cn(card, "p-2 flex items-center gap-2.5")}>
            <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}33` }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 rounded-full bg-foreground/15" style={{ width: `${70 - i * 12}%` }} />
              <div className="h-1.5 rounded-full bg-secondary w-1/3" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  }

  if (kind === "ledger") {
    return (
      <div className={cn(card, "w-44 p-3.5 space-y-3")}>
        <div className="flex items-center justify-between">
          <div className="h-2 rounded-full bg-foreground/15 w-16" />
          <div className="h-2 rounded-full w-7" style={{ backgroundColor: color }} />
        </div>
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
            initial={{ width: "0%" }} animate={{ width: "68%" }} transition={{ duration: 1, ease: EASE, delay: 0.15 }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            <div className="w-4 h-4 rounded-full border-2 border-white" style={{ backgroundColor: `${color}66` }} />
            <div className="w-4 h-4 rounded-full border-2 border-white bg-secondary" />
          </div>
          <div className="h-1.5 rounded-full bg-secondary flex-1" />
        </div>
      </div>
    );
  }

  // home
  return (
    <div className={cn(card, "w-44 p-3")}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex -space-x-1.5">
          <div className="w-6 h-6 rounded-full border-2 border-white" style={{ backgroundColor: `${color}55` }} />
          <div className="w-6 h-6 rounded-full border-2 border-white bg-secondary" />
        </div>
        <div className="h-2 rounded-full bg-foreground/15 flex-1" />
      </div>
      <div className="flex justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-5 h-5 rounded-full"
            style={{ backgroundColor: i === 3 ? color : "var(--secondary)" }}
            animate={i === 3 ? { scale: [1, 1.18, 1] } : undefined}
            transition={i === 3 ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

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
    <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
      <div className="flex items-center justify-between h-8 max-w-sm w-full mx-auto">
        {onBack ? (
          <button onClick={onBack} className="w-8 h-8 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-7" />}
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-5 bg-foreground" : "w-1.5 bg-border")} />
          ))}
        </div>
        <div className="w-7" />
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto pb-8">
        <motion.h1 variants={rise} className="font-heading text-3xl text-foreground tracking-tight">{title}</motion.h1>
        {subtitle && <motion.p variants={rise} className="text-sm text-muted-foreground mt-1.5 mb-8">{subtitle}</motion.p>}
        {!subtitle && <div className="mb-8" />}
        <motion.div variants={rise}>{children}</motion.div>
      </motion.div>

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
export default function OnboardingClient({ userId, firstName, avatar, initialInvite }: Props) {
  // The "add to home screen" prompt comes first for the full web-app feel.
  const [step, setStep] = useState<Step>("install");
  const [pillar, setPillar] = useState(0);

  // Profile
  const [name, setName] = useState(firstName);
  const [accentColor, setAccentColor] = useState("sage");
  const [colourPicked, setColourPicked] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatar);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Couple
  const [tab, setTab] = useState<Tab>(initialInvite ? "join" : "create");
  const [joinCode, setJoinCode] = useState(initialInvite ?? "");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Finish
  const [startDate, setStartDate] = useState("");

  // Plan
  const [planBusy, setPlanBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [betaCode, setBetaCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  // Onboarding is a full-screen, no-scroll experience — lock the page behind it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Capture the install prompt early so it's ready by the install step.
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // If we're already running as the installed app, skip the install step.
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) setStep("welcome");
  }, []);

  // Track travel direction so the page transition slides the right way.
  const [direction, setDirection] = useState(1);
  const [pillarDir, setPillarDir] = useState(1);
  const prevStep = useRef<Step>(step);
  useEffect(() => {
    const order: Step[] = ["install", "welcome", "pillars", "name", "photo", "colour", "couple", "finish", "plan"];
    setDirection(order.indexOf(step) >= order.indexOf(prevStep.current) ? 1 : -1);
    prevStep.current = step;
  }, [step]);

  const selectedAccent = ACCENT_COLORS.find((c) => c.name === accentColor) ?? ACCENT_COLORS[0];
  // Brand colour: ink until the user actively picks their accent.
  const brandHex = colourPicked ? selectedAccent.hex : NEUTRAL_INK;
  const brandBg = colourPicked ? { backgroundColor: selectedAccent.hex } : undefined;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateImage(file);
    if (err) { setError(err); return; }
    setError(null);
    setCropFile(file);
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
        // Relay to PostHog once the user reaches the (authenticated) app, since
        // onboarding is outside the analytics provider.
        try { sessionStorage.setItem("ph_pending_event", "couple_created"); } catch { /* ignore */ }
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
      if (result && "error" in result && result.error) { setError(result.error); return; }
      try { sessionStorage.setItem("ph_pending_event", "couple_joined"); } catch { /* ignore */ }
      // Joining completes the pair → the 30-day trial is now live. Offer the plan.
      setStep("plan");
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
      try {
        if (startDate && coupleId) await setOnboardingStartDate(userId, coupleId, startDate);
      } catch {
        // Saving the (optional) start date shouldn't block finishing.
      }
      setStep("plan");
    });
  }

  // Plan step: ride the free trial (cardless) or lock founding pricing now.
  function startTrial() {
    window.location.replace("/home");
  }
  function subscribeFromOnboarding(plan: "monthly" | "annual") {
    setPlanBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const r = await startCheckout(plan, "onboarding");
        if (r.url) { window.location.href = r.url; return; }
        setError(r.error ?? "something went wrong");
      } catch (e) {
        setError(e instanceof Error ? e.message : "something went wrong");
      } finally {
        setPlanBusy(false);
      }
    });
  }
  function applyBetaCode() {
    if (!betaCode.trim()) return;
    setPlanBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const r = await redeemBetaCode(betaCode.trim());
        if (r.ok) { window.location.replace("/home"); return; }
        setError(r.error ?? "could not redeem code");
      } catch (e) {
        setError(e instanceof Error ? e.message : "could not redeem code");
      } finally {
        setPlanBusy(false);
      }
    });
  }

  // Base button styling. When an accent background is set (brandBg) we force
  // white text; otherwise the Button's default variant supplies a theme-aware
  // text colour (so it stays readable in dark mode instead of white-on-light).
  const accentBtn = "w-full h-12 rounded-xl text-[15px] font-medium";
  const accentBtnCls = cn(accentBtn, brandBg && "text-white");
  const greetName = (firstName || "").trim().split(/\s+/)[0] || "there";
  const lastPillar = PILLARS.length - 1;

  function renderStep() {
    switch (step) {
      // ── Welcome — personal, distinct from the login screen ──────────────────
      case "welcome":
        return (
          <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
            <div className="flex justify-end max-w-sm w-full mx-auto">
              <ThemeToggle compact />
            </div>
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.p variants={rise} className="font-heading text-2xl text-muted-foreground/50 tracking-tight mb-2">aspaceforus.</motion.p>
              <motion.h1 variants={rise} className="font-heading text-5xl text-foreground tracking-tight">hello, {greetName}.</motion.h1>
              <motion.p variants={rise} className="text-[15px] text-muted-foreground mt-4 max-w-[17rem] leading-relaxed">
                welcome to <span className="font-heading">us.</span> — a calm little home for the two of you.
              </motion.p>
              <motion.p variants={rise} className="text-sm text-muted-foreground/60 mt-2 max-w-[16rem] leading-relaxed">
                let&apos;s take a quick look around, then set things up together.
              </motion.p>
            </motion.div>
            <motion.div variants={rise} initial="hidden" animate="show" className="max-w-sm w-full mx-auto">
              <Button onClick={() => setStep("pillars")} className={accentBtnCls} style={brandBg}>
                take a look around
              </Button>
            </motion.div>
          </div>
        );

      // ── Pillars tour — animated pager ───────────────────────────────────────
      case "pillars": {
        const p = PILLARS[pillar];
        return (
          <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
            <div className="flex items-center justify-between h-8 max-w-sm w-full mx-auto">
              <button
                onClick={() => { if (pillar > 0) { setPillarDir(-1); setPillar(pillar - 1); } else setStep("welcome"); }}
                className="w-8 h-8 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex gap-1.5">
                {PILLARS.map((pl, i) => (
                  <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300", i === pillar ? "w-5" : "w-1.5 bg-border")}
                    style={i === pillar ? { backgroundColor: pl.color } : undefined} />
                ))}
              </div>
              <button onClick={() => setStep("name")} className="text-xs text-muted-foreground/60 hover:text-muted-foreground">skip</button>
            </div>

            <div className="flex-1 flex items-center justify-center max-w-sm w-full mx-auto pb-8 overflow-hidden">
              <AnimatePresence mode="wait" custom={pillarDir}>
                <motion.div
                  key={pillar}
                  custom={pillarDir}
                  variants={screenVariants}
                  initial="enter" animate="center" exit="exit"
                  transition={{ duration: 0.32, ease: EASE }}
                  className="flex flex-col items-center text-center w-full"
                >
                  <motion.div
                    className="mb-8"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <PillarArt kind={p.name} color={p.color} />
                  </motion.div>
                  <h1 className="font-heading text-4xl text-foreground tracking-tight">{p.name}.</h1>
                  <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed max-w-[18rem]">{p.blurb}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="max-w-sm w-full mx-auto">
              <Button
                onClick={() => { if (pillar < lastPillar) { setPillarDir(1); setPillar(pillar + 1); } else setStep("name"); }}
                className="w-full h-12 rounded-xl text-white text-[15px] font-medium transition-colors duration-300"
                style={{ backgroundColor: p.color }}
              >
                {pillar < lastPillar ? "next" : "set up your space"}
              </Button>
            </div>
          </div>
        );
      }

      // ── Name ────────────────────────────────────────────────────────────────
      case "name":
        return (
          <SetupShell index={0} total={4} onBack={() => { setPillarDir(-1); setPillar(lastPillar); setStep("pillars"); }} title="what's your name?" subtitle="so your partner always knows it's you." footer={<Button onClick={() => setStep("photo")} disabled={!name.trim()} className={accentBtnCls} style={brandBg}>continue</Button>}>
            <Input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => { const t = e.currentTarget; setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }} placeholder="your first name" maxLength={30} className="h-12 rounded-xl bg-card border-border/60 text-base" />
          </SetupShell>
        );

      // ── Photo ───────────────────────────────────────────────────────────────
      case "photo":
        return (
          <SetupShell index={1} total={4} onBack={() => setStep("name")} title="add a photo" subtitle="optional — it helps your space feel like yours. you can change it later." footer={<><Button onClick={() => setStep("colour")} className={accentBtnCls} style={brandBg}>continue</Button>{!avatarPreview && <button onClick={() => setStep("colour")} className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground">skip for now</button>}</>}>
            <div className="flex justify-center">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative w-28 h-28 rounded-full focus:outline-none group">
                {avatarPreview ? (
                  <>
                    <SignedImg src={avatarPreview} alt="" className="w-28 h-28 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${brandHex}` }} />
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
        );

      // ── Colour ──────────────────────────────────────────────────────────────
      case "colour":
        return (
          <SetupShell index={2} total={4} onBack={() => setStep("photo")} title="pick your colour" subtitle="this is how you'll show up across your shared space." footer={<Button onClick={() => setStep("couple")} className={accentBtnCls} style={brandBg}>continue</Button>}>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-secondary flex items-center justify-center transition-all duration-300" style={{ boxShadow: `0 0 0 3px ${brandHex}` }}>
                {avatarPreview
                  ? <SignedImg src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-semibold text-muted-foreground">{(name[0] ?? "?").toUpperCase()}</span>}
              </div>
            </div>
            <div className="flex justify-center gap-3.5">
              {ACCENT_COLORS.map((c) => (
                <button key={c.name} type="button" onClick={() => { setAccentColor(c.name); setColourPicked(true); }} className={cn("w-10 h-10 rounded-full border-2 transition-all", accentColor === c.name && colourPicked ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: c.hex }} aria-label={c.name} />
              ))}
            </div>
          </SetupShell>
        );

      // ── Couple ──────────────────────────────────────────────────────────────
      case "couple":
        return (
          <SetupShell index={3} total={4} onBack={() => setStep("colour")} title="your shared space" subtitle="start a new space, or join the one your partner already made." footer={tab === "create" ? (<Button onClick={handleCreate} disabled={isPending} className={accentBtnCls} style={brandBg}>{isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create our space"}</Button>) : (<Button onClick={handleJoin} disabled={isPending || joinCode.length < 8} className={cn(accentBtnCls, "gap-2")} style={brandBg}>{isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Heart className="w-4 h-4" /> join</>}</Button>)}>
            <div className="flex bg-secondary rounded-2xl p-1 mb-5">
              {(["create", "join"] as Tab[]).map((t) => (
                <button key={t} onClick={() => { setTab(t); setError(null); }} className={cn("flex-1 py-2 text-sm font-medium rounded-xl transition-all", tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{t === "create" ? "create" : "join with code"}</button>
              ))}
            </div>
            {tab === "create" ? (
              <p className="text-sm text-muted-foreground text-center leading-relaxed">we&apos;ll create your space and give you a code to share with your partner so they can join.</p>
            ) : (
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toLowerCase())} onFocus={(e) => { const t = e.currentTarget; setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }} placeholder="paste your code" maxLength={8} className="h-12 rounded-xl text-center text-lg tracking-[0.3em] font-mono bg-card border-border/60" />
            )}
            {error && <p className="text-sm text-destructive text-center mt-4">{error}</p>}
          </SetupShell>
        );

      // ── Plan — every new space gets 30 days of premium; lock in founding price ─
      case "plan": {
        const hex = selectedAccent.hex;
        const features = [
          "unlimited photos in your vault",
          "plan any month ahead, not just this one",
          "full history — moods, daily questions, ledger",
          "unlimited lists, savings pots & folders",
          "themes & a custom home banner",
        ];
        return (
          <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
              <motion.span variants={rise} className="self-start inline-flex items-center px-2.5 py-1 rounded-full mb-4 text-[11px] font-medium" style={{ backgroundColor: `${hex}1f`, color: hex }}>
                ✨ 30 days free · no card needed
              </motion.span>
              <motion.h1 variants={rise} className="font-heading text-3xl text-foreground tracking-tight">your space, unlocked.</motion.h1>
              <motion.p variants={rise} className="text-sm text-muted-foreground mt-1.5 mb-7">
                every new space starts with 30 days of <span className="font-heading">premium</span> — on us.
              </motion.p>
              <motion.ul variants={rise} className="space-y-2.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: hex }} />
                    <span>{f}</span>
                  </li>
                ))}
              </motion.ul>
            </motion.div>

            <div className="max-w-sm w-full mx-auto space-y-3">
              <Button onClick={startTrial} disabled={planBusy} className={cn(accentBtn, "text-white")} style={{ backgroundColor: hex }}>
                start your 30 days free
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-px bg-border flex-1" />
                <span className="text-[11px] text-muted-foreground/60">or lock founding pricing</span>
                <div className="h-px bg-border flex-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => subscribeFromOnboarding("annual")} disabled={planBusy} variant="outline" className="flex-1 h-12 rounded-xl flex flex-col gap-0 leading-tight">
                  <span className="text-sm font-medium">£19.99 / yr</span>
                  <span className="text-[10px] text-muted-foreground">best value</span>
                </Button>
                <Button onClick={() => subscribeFromOnboarding("monthly")} disabled={planBusy} variant="outline" className="flex-1 h-12 rounded-xl flex flex-col gap-0 leading-tight">
                  <span className="text-sm font-medium">£1.98 / mo</span>
                  <span className="text-[10px] text-muted-foreground">99p each</span>
                </Button>
              </div>
              <p className="text-[11px] text-center text-muted-foreground/50">annual locks the founding rate · cancel anytime</p>

              {showCode ? (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={betaCode}
                    onChange={(e) => setBetaCode(e.target.value)}
                    placeholder="beta code"
                    className="h-11 rounded-xl bg-card border-border/60 text-center tracking-wide"
                  />
                  <Button onClick={applyBetaCode} disabled={planBusy || !betaCode.trim()} variant="outline" className="h-11 rounded-xl px-5">
                    {planBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "apply"}
                  </Button>
                </div>
              ) : (
                <button onClick={() => setShowCode(true)} className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground pt-1">
                  have a beta code?
                </button>
              )}

              {error && <p className="text-sm text-destructive text-center">{error}</p>}
            </div>
          </div>
        );
      }

      // ── Add to home screen (first step) ─────────────────────────────────────
      case "install":
        return <InstallStep prompt={installPrompt} accentHex={NEUTRAL_INK} onDone={() => setStep("welcome")} />;

      // ── Finish (after create) ───────────────────────────────────────────────
      case "finish":
        return (
          <div className="min-h-full flex flex-col px-6 pt-8 pb-10">
            <motion.div variants={stagger} initial="hidden" animate="show" className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
              <motion.h1 variants={rise} className="font-heading text-3xl text-foreground tracking-tight">you&apos;re all set.</motion.h1>
              <motion.p variants={rise} className="text-sm text-muted-foreground mt-1.5 mb-8">two last touches — both optional.</motion.p>
              <motion.div variants={rise} className="mb-5">
                <label className="text-xs text-muted-foreground block mb-1.5">when did you get together?</label>
                <DateField value={startDate} onChange={setStartDate} max={new Date().toISOString().split("T")[0]} placeholder="select a date" className="h-12" />
              </motion.div>
              <motion.div variants={rise} className="bg-card border border-border/60 rounded-2xl p-5 text-center shadow-card">
                <p className="text-xs text-muted-foreground mb-3">scan or share so your partner can join</p>
                {inviteCode && origin && (
                  <div className="inline-flex p-3 bg-card rounded-2xl border border-border/40 mb-3">
                    <QRCodeSVG value={`${origin}/join?code=${inviteCode}`} size={144} bgColor="#ffffff" fgColor="#2C2C2B" level="M" />
                  </div>
                )}
                <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-foreground mb-3">{inviteCode}</p>
                <Button variant="outline" size="sm" onClick={copyCode} className="rounded-xl gap-2 border-border/60 h-9 text-xs">{copied ? <><Check className="w-3.5 h-3.5 text-sage" /> copied!</> : <><Copy className="w-3.5 h-3.5" /> copy code</>}</Button>
              </motion.div>
            </motion.div>
            <div className="max-w-sm w-full mx-auto">
              <Button onClick={handleFinish} disabled={isPending} className={accentBtnCls} style={brandBg}>{isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "continue"}</Button>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <Ambient accent={colourPicked ? selectedAccent.hex : NEUTRAL_GLOW} />
      {cropFile && <CropModal file={cropFile} onConfirm={handleCropConfirm} onCancel={() => setCropFile(null)} />}
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={screenVariants}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.42, ease: EASE }}
          className="absolute inset-0 z-10 overflow-y-auto"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
