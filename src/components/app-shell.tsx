"use client";

import { Suspense, useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SwipePager } from "@/components/swipe-pager";
import { FabGate } from "@/contexts/fab-context";
import { useSetNavActive } from "@/contexts/nav-active";
import { useNotifications } from "@/contexts/notification-context";
import PageTransition from "@/components/page-transition";
import DashboardClient from "@/app/(app)/home/dashboard-client";
import CalendarClient from "@/app/(app)/calendar/calendar-client";
import LedgerClient from "@/app/(app)/ledger/ledger-client";
import VaultPhotos from "@/app/(app)/vault/vault-photos";
import VaultTodos from "@/app/(app)/vault/vault-todos";
import { VaultLists, VAULT_TABS, type VaultTab } from "@/app/(app)/vault/vault-client";

// One flat pager across the whole app — no nesting — so every screen swipes into
// its neighbour: home · calendar · [vault: photos · to-dos · lists] · ledger.
// The three vault screens share one header (VaultTopBar) whose pill tracks the
// swipe live. Screens stay mounted (state + realtime); tab pages render null.
const VAULT_BASE = 2; // index of the first vault pane (photos)
const COUNT = 6;

// `active` = this is the visible tab → it loads its data + opens its realtime
// channel. Inactive (mounted-for-peek) panes stay quiet until you land on them.
function paneFor(i: number, active: boolean): ReactNode {
  switch (i) {
    case 0: return <DashboardClient active={active} />;
    case 1: return <CalendarClient active={active} />;
    case 2: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultPhotos active={active} /></div>;
    case 3: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultTodos active={active} /></div>;
    case 4: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultLists active={active} /></div>;
    default: return <LedgerClient active={active} />;
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

  // The pager index is its own state, updated INSTANTLY on settle (so the visual
  // and nav don't wait on a router round-trip). External nav syncs it via the URL.
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

  // The vault pill + bottom-nav highlight follow the live swipe (imperative, no
  // re-renders); the nav switches the moment you cross a tab's half-way point.
  const onProgress = useCallback((p: number) => {
    vaultBar.current?.setProgress(p);
    pushNav(navSectionOf(p));
  }, [pushNav]);

  // Settled / external index changes: sync the pill + nav highlight, and only
  // mark the ACTIVE tab seen (so a mounted neighbour doesn't clear its badge).
  useEffect(() => {
    if (isTab) {
      vaultBar.current?.setProgress(index);
      const sec = navSectionOf(index);
      pushNav(sec);
      markSeenRef.current(SECTION_NAME[sec]);
    } else { vaultBar.current?.setProgress(-99); pushNav(null); }
  }, [isTab, index, pushNav]);

  return (
    <>
      <VaultTopBar ref={vaultBar} onSelect={(sub) => go(VAULT_BASE + sub)} />

      <div style={{ display: isTab ? undefined : "none" }} aria-hidden={!isTab}>
        <SwipePager
          index={index}
          count={COUNT}
          className="h-[calc(100dvh-5rem-env(safe-area-inset-bottom))]"
          onIndexChange={(i) => { if (i !== index) go(i); }}
          onProgress={onProgress}
          renderPane={(i, active) => <FabGate active={active && isTab}>{paneFor(i, active && isTab)}</FabGate>}
        />
      </div>

      {!isTab && <PageTransition>{children}</PageTransition>}
    </>
  );
}

// ── Shared vault header — pill slides live with the swipe ─────────────────────
interface VaultBarHandle { setProgress: (p: number) => void }

const VaultTopBar = forwardRef<VaultBarHandle, { onSelect: (sub: number) => void }>(function VaultTopBar({ onSelect }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    setProgress(p: number) {
      const sub = p - VAULT_BASE;                 // 0..2 within the vault range
      const clamped = Math.max(0, Math.min(2, sub));
      // Opacity: full inside the vault range, fading over the half-pane on each side.
      let op = 1;
      if (p <= VAULT_BASE) op = Math.max(0, Math.min(1, (p - (VAULT_BASE - 0.6)) / 0.6));
      else if (p >= 4) op = Math.max(0, Math.min(1, (4.6 - p) / 0.6));
      if (root.current) {
        root.current.style.opacity = String(op);
        root.current.style.pointerEvents = op > 0.5 ? "auto" : "none";
      }
      if (indicator.current) indicator.current.style.transform = `translateX(${clamped * 100}%)`;
      const near = Math.round(clamped);
      labels.current.forEach((el, i) => {
        if (el) el.style.color = i === near ? "var(--foreground)" : "var(--muted-foreground)";
      });
    },
  }), []);

  return (
    <div
      ref={root}
      className="fixed top-0 left-0 right-0 z-40 bg-background px-4 pt-10 pb-2.5 border-b border-border/30"
      style={{ opacity: 0, pointerEvents: "none" }}
    >
      <div className="max-w-lg mx-auto">
        <h1 className="font-heading text-3xl text-foreground tracking-tight mb-3">vault.</h1>
        <div className="relative flex bg-secondary/60 rounded-full p-1">
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
