"use client";

import { Suspense, useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SwipePager } from "@/components/swipe-pager";
import { FabGate } from "@/contexts/fab-context";
import { useSetNavActive } from "@/contexts/nav-active";
import { useNotifications } from "@/contexts/notification-context";
import DashboardClient from "@/app/(app)/home/dashboard-client";
import CalendarClient from "@/app/(app)/calendar/calendar-client";
import LedgerClient from "@/app/(app)/ledger/ledger-client";
import VaultPhotos from "@/app/(app)/vault/vault-photos";
import VaultTodos from "@/app/(app)/vault/vault-todos";
import { VaultLists, VAULT_TABS, type VaultTab } from "@/app/(app)/vault/vault-client";

// One flat JS-transform rail: home · calendar · [vault: photos · to-dos · lists] ·
// ledger. Every screen swipes continuously into its neighbour. The three vault
// screens share one header (VaultTopBar), driven from the pager's onProgress in
// the SAME frame as the rail — so it slides as one piece with zero drift.
const VAULT_BASE = 2; // index of the first vault pane (photos)
const COUNT = 6;

// `live` = active tab + an immediate neighbour → keeps a realtime channel. All
// panes still mount + load, so swiping is always full-state.
function paneFor(i: number, live: boolean): ReactNode {
  switch (i) {
    case 0: return <DashboardClient live={live} />;
    case 1: return <CalendarClient live={live} />;
    case 2: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultPhotos live={live} /></div>;
    case 3: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultTodos live={live} /></div>;
    case 4: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultLists live={live} /></div>;
    default: return <LedgerClient live={live} />;
  }
}

function routeFor(i: number): string {
  if (i === 0) return "/home";
  if (i === 1) return "/calendar";
  if (i === 5) return "/ledger";
  return `/vault?tab=${VAULT_TABS[i - VAULT_BASE].id}`;
}

function storedVaultTab(): VaultTab {
  if (typeof window !== "undefined") {
    const s = localStorage.getItem("us_vault_tab") as VaultTab | null;
    if (s && VAULT_TABS.some((t) => t.id === s)) return s;
  }
  return "lists";
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

// Pager index 0..5 → bottom-nav section 0..3 (vault's 3 panes all map to "vault").
function navSectionOf(p: number) { return p < 0.5 ? 0 : p < 1.5 ? 1 : p < 4.5 ? 2 : 3; }
const SECTION_NAME = ["home", "calendar", "vault", "ledger"] as const;

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabParam = useSearchParams().get("tab") as VaultTab | null;
  const setNav = useSetNavActive();
  const { markSeen } = useNotifications();
  const markSeenRef = useRef(markSeen);
  markSeenRef.current = markSeen;

  // The index implied by the URL (-1 when the route isn't a swipe tab).
  let pathIdx = -1;
  if (pathname === "/home") pathIdx = 0;
  else if (pathname === "/calendar") pathIdx = 1;
  else if (pathname === "/ledger") pathIdx = 5;
  else if (pathname === "/vault") {
    const t = tabParam && VAULT_TABS.some((x) => x.id === tabParam) ? tabParam : storedVaultTab();
    pathIdx = VAULT_BASE + VAULT_TABS.findIndex((x) => x.id === t);
  }
  const isTab = pathIdx >= 0;

  const [index, setIndex] = useState(() => (pathIdx >= 0 ? pathIdx : 0));
  useEffect(() => {
    if (pathIdx >= 0 && pathIdx !== index) setIndex(pathIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathIdx]);

  const vaultBar = useRef<VaultBarHandle>(null);
  const lastNav = useRef<number | null>(null);
  const pushNav = useCallback((sec: number | null) => {
    if (sec !== lastNav.current) { lastNav.current = sec; setNav(sec); }
  }, [setNav]);

  const go = useCallback((i: number) => {
    setIndex(i);
    if (i >= VAULT_BASE && i <= 4 && typeof window !== "undefined") {
      localStorage.setItem("us_vault_tab", VAULT_TABS[i - VAULT_BASE].id);
    }
    router.replace(routeFor(i), { scroll: false });
  }, [router]);

  // Vault pill + bottom-nav highlight follow the live swipe (imperative).
  const onProgress = useCallback((p: number) => {
    vaultBar.current?.setProgress(p);
    pushNav(navSectionOf(p));
  }, [pushNav]);

  // Settled / external index changes: sync the pill + nav highlight, mark seen.
  const prevIndexRef = useRef(index);
  useEffect(() => {
    const indexChanged = prevIndexRef.current !== index;
    prevIndexRef.current = index;
    if (isTab) {
      const sec = navSectionOf(index);
      markSeenRef.current(SECTION_NAME[sec]);
      // When the index changed (tab tap / swipe settle) the pager animates and
      // its onProgress drives the highlight continuously — exactly like a swipe.
      // Pushing the target here too would flip target→origin (first anim frame)
      // →target: the adjacent-tap jitter. So only sync directly when the pager
      // isn't moving (return from settings, deep link to the current tab).
      if (!indexChanged) { vaultBar.current?.setProgress(index); pushNav(sec); }
    } else { vaultBar.current?.setProgress(-99); pushNav(null); }
  }, [isTab, index, pushNav]);

  // Simultaneous cross-fade between the pager (tabs) and a routed page (settings):
  // the incoming layer fades in as the outgoing fades out, with no blank gap in
  // between — so opening / leaving settings reads as immediate, not staged. The
  // route's loading.tsx commits the navigation instantly, so the fade starts the
  // moment you tap rather than after the server data resolves.
  const target: "tab" | "page" = isTab ? "tab" : "page";
  const [pageMounted, setPageMounted] = useState(target === "page");
  const [pageOpaque, setPageOpaque] = useState(target === "page");
  useEffect(() => {
    if (target === "page") {
      setPageMounted(true);
      const r = requestAnimationFrame(() => setPageOpaque(true)); // fade in next frame
      return () => cancelAnimationFrame(r);
    }
    setPageOpaque(false);                                          // fade out now
    const t = window.setTimeout(() => setPageMounted(false), 220); // unmount after fade
    return () => window.clearTimeout(t);
  }, [target]);
  const lastPage = useRef<ReactNode>(children);
  if (!isTab) lastPage.current = children;

  const pagerOpaque = !pageOpaque;

  return (
    <>
      <VaultTopBar ref={vaultBar} onSelect={(sub) => go(VAULT_BASE + sub)} />

      <div
        aria-hidden={!isTab}
        style={{ opacity: pagerOpaque ? 1 : 0, transition: "opacity 200ms ease", pointerEvents: pagerOpaque ? undefined : "none" }}
      >
        <SwipePager
          index={index}
          count={COUNT}
          className="h-[calc(100dvh-5rem-env(safe-area-inset-bottom))]"
          onIndexChange={(i) => { if (i !== index) go(i); }}
          onProgress={onProgress}
          renderPane={(i, active) => <FabGate active={active && isTab}>{paneFor(i, Math.abs(i - index) <= 1 && isTab)}</FabGate>}
        />
      </div>

      {pageMounted && (
        <div
          className="fixed inset-0 z-30 bg-background overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom))]"
          style={{ opacity: pageOpaque ? 1 : 0, transition: "opacity 200ms ease", willChange: "opacity" }}
        >
          {lastPage.current}
        </div>
      )}
    </>
  );
}

// ── Shared vault header — slides + pill track the swipe (in sync, no drift) ────
interface VaultBarHandle { setProgress: (p: number) => void }

const VaultTopBar = forwardRef<VaultBarHandle, { onSelect: (sub: number) => void }>(function VaultTopBar({ onSelect }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    setProgress(p: number) {
      const clamped = Math.max(0, Math.min(2, p - VAULT_BASE));
      // Slide the whole header with the swipe (no fade): off-right before photos,
      // locked across the vault, off-left after lists.
      let tx = 0;
      if (p < VAULT_BASE) tx = (VAULT_BASE - p) * 100;
      else if (p > 4) tx = (4 - p) * 100;
      tx = Math.max(-100, Math.min(100, tx));
      if (root.current) root.current.style.transform = `translateX(${tx}%)`;
      if (indicator.current) indicator.current.style.transform = `translateX(${clamped * 100}%)`;
      const near = Math.round(clamped);
      labels.current.forEach((el, i) => {
        if (el) el.style.color = i === near ? "var(--foreground)" : "var(--muted-foreground)";
      });
    },
  }), []);

  // The bar itself is swipe-through (pointer-events: none) so it never steals the
  // gesture; only the pill buttons are interactive.
  return (
    <div
      ref={root}
      className="fixed top-0 left-0 right-0 z-40 bg-background px-4 pt-10 pb-2.5 border-b border-border/30"
      style={{ transform: "translateX(100%)", pointerEvents: "none" }}
    >
      <div className="max-w-lg mx-auto">
        <h1 className="font-heading text-3xl text-foreground tracking-tight mb-3">vault.</h1>
        <div className="relative flex bg-secondary/60 rounded-full p-1" style={{ pointerEvents: "auto" }}>
          <div
            ref={indicator}
            className="absolute top-1 left-1 bottom-1 rounded-full bg-card shadow-sm"
            style={{ width: "calc((100% - 0.5rem) / 3)" }}
          />
          {VAULT_TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { labels.current[i] = el; }}
              onClick={() => onSelect(i)}
              className="relative z-10 flex-1 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
