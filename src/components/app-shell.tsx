"use client";

import { Suspense, useRef, useCallback, useImperativeHandle, forwardRef, type ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SwipePager } from "@/components/swipe-pager";
import { FabGate } from "@/contexts/fab-context";
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

function paneFor(i: number): ReactNode {
  switch (i) {
    case 0: return <DashboardClient />;
    case 1: return <CalendarClient />;
    case 2: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultPhotos /></div>;
    case 3: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultTodos /></div>;
    case 4: return <div className="max-w-lg mx-auto pt-[8.5rem]"><VaultLists /></div>;
    default: return <LedgerClient />;
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

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabParam = useSearchParams().get("tab") as VaultTab | null;

  let idx = -1;
  if (pathname === "/home") idx = 0;
  else if (pathname === "/calendar") idx = 1;
  else if (pathname === "/ledger") idx = 5;
  else if (pathname === "/vault") {
    const t = tabParam && VAULT_TABS.some((x) => x.id === tabParam) ? tabParam : storedVaultTab();
    idx = VAULT_BASE + VAULT_TABS.findIndex((x) => x.id === t);
  }
  const isTab = idx >= 0;
  const last = useRef(0);
  if (isTab) last.current = idx;
  const activeIndex = isTab ? idx : last.current;

  const vaultBar = useRef<VaultBarHandle>(null);

  const go = useCallback((i: number) => {
    if (i >= VAULT_BASE && i <= 4 && typeof window !== "undefined") {
      localStorage.setItem("us_vault_tab", VAULT_TABS[i - VAULT_BASE].id);
    }
    router.replace(routeFor(i), { scroll: false });
  }, [router]);

  // Keep the vault header's pill in sync when the index changes without a swipe
  // (tab tap / deep link), and hide it entirely off the tab pager.
  useEffect(() => {
    vaultBar.current?.setProgress(isTab ? activeIndex : -99);
  }, [isTab, activeIndex]);

  return (
    <>
      <VaultTopBar ref={vaultBar} onSelect={(sub) => go(VAULT_BASE + sub)} />

      <div style={{ display: isTab ? undefined : "none" }} aria-hidden={!isTab}>
        <SwipePager
          index={activeIndex}
          count={COUNT}
          onIndexChange={(i) => { if (i !== idx) go(i); }}
          onProgress={(p) => vaultBar.current?.setProgress(p)}
          renderPane={(i, active) => <FabGate active={active && isTab}>{paneFor(i)}</FabGate>}
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
