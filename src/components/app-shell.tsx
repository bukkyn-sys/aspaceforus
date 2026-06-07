"use client";

import { Suspense, useRef, useState, useEffect, useCallback, type ReactNode } from "react";
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

// Four top-level sections, each ONE outer pane: home · calendar · vault · ledger.
// The vault is a true nested section — a sticky shared header (vault. + pill) above
// its own 3-pane sub-pager (photos · to-dos · lists) — so it slides in/out as one
// unit like the others, while the sub-tabs swipe underneath the pinned header.
const COUNT = 4;
const VAULT_INDEX = 2;

function storedVaultTab(): VaultTab {
  if (typeof window !== "undefined") {
    const s = localStorage.getItem("us_vault_tab") as VaultTab | null;
    if (s && VAULT_TABS.some((t) => t.id === s)) return s;
  }
  return "lists";
}

function routeFor(i: number, subId: VaultTab): string {
  if (i === 0) return "/home";
  if (i === 1) return "/calendar";
  if (i === VAULT_INDEX) return `/vault?tab=${subId}`;
  return "/ledger";
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

// Outer index → bottom-nav section (now 1:1).
function navSectionOf(p: number) { return p < 0.5 ? 0 : p < 1.5 ? 1 : p < 2.5 ? 2 : 3; }
const SECTION_NAME = ["home", "calendar", "vault", "ledger"] as const;

interface VaultNav { subIndex: number; onSub: (j: number) => void }

function paneFor(i: number, live: boolean, active: boolean, vault: VaultNav): ReactNode {
  switch (i) {
    case 0: return <FabGate active={active}><DashboardClient live={live} /></FabGate>;
    case 1: return <FabGate active={active}><CalendarClient live={live} /></FabGate>;
    case VAULT_INDEX: return <VaultSection live={live} active={active} subIndex={vault.subIndex} onSub={vault.onSub} />;
    default: return <FabGate active={active}><LedgerClient live={live} /></FabGate>;
  }
}

function AppShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabParam = useSearchParams().get("tab") as VaultTab | null;
  const setNav = useSetNavActive();
  const { markSeen } = useNotifications();
  const markSeenRef = useRef(markSeen);
  markSeenRef.current = markSeen;

  // The outer index implied by the URL (-1 when not a swipe tab).
  let pathIdx = -1;
  if (pathname === "/home") pathIdx = 0;
  else if (pathname === "/calendar") pathIdx = 1;
  else if (pathname === "/vault") pathIdx = VAULT_INDEX;
  else if (pathname === "/ledger") pathIdx = 3;
  const isTab = pathIdx >= 0;

  // Vault sub-tab from the URL (?tab=) falling back to the last-used.
  const urlSub: VaultTab = (tabParam && VAULT_TABS.some((x) => x.id === tabParam)) ? tabParam : storedVaultTab();
  const urlSubIdx = Math.max(0, VAULT_TABS.findIndex((x) => x.id === urlSub));

  const [index, setIndex] = useState(() => (pathIdx >= 0 ? pathIdx : 0));
  const [vaultSub, setVaultSub] = useState(urlSubIdx);
  useEffect(() => {
    if (pathIdx >= 0 && pathIdx !== index) setIndex(pathIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathIdx]);
  // Sync the sub-tab when arriving at /vault?tab= via an external nav / deep link.
  useEffect(() => {
    if (pathname === "/vault" && urlSubIdx !== vaultSub) setVaultSub(urlSubIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, urlSubIdx]);

  const lastNav = useRef<number | null>(null);
  const pushNav = useCallback((sec: number | null) => {
    if (sec !== lastNav.current) { lastNav.current = sec; setNav(sec); }
  }, [setNav]);

  const vaultSubRef = useRef(vaultSub); vaultSubRef.current = vaultSub;
  const go = useCallback((i: number) => {
    setIndex(i);
    router.replace(routeFor(i, VAULT_TABS[vaultSubRef.current].id), { scroll: false });
  }, [router]);

  // Vault sub-tab navigation (from the nested sub-pager or a pill tap).
  const goSub = useCallback((j: number) => {
    setVaultSub(j);
    if (typeof window !== "undefined") localStorage.setItem("us_vault_tab", VAULT_TABS[j].id);
    router.replace(`/vault?tab=${VAULT_TABS[j].id}`, { scroll: false });
  }, [router]);

  const onProgress = useCallback((p: number) => { pushNav(navSectionOf(p)); }, [pushNav]);

  // Settled / external index changes: sync the nav highlight + mark the section seen.
  useEffect(() => {
    if (isTab) {
      const sec = navSectionOf(index);
      pushNav(sec);
      markSeenRef.current(SECTION_NAME[sec]);
    } else { pushNav(null); }
  }, [isTab, index, pushNav]);

  // Sequential cross-fade between the pager (tabs) and a routed page (settings):
  // the current view fully fades out, THEN the next fully fades in — no overlap.
  const target: "tab" | "page" = isTab ? "tab" : "page";
  const [shown, setShown] = useState<"tab" | "page">(target);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (target === shown) return;
    setFading(true);
    const t = window.setTimeout(() => { setShown(target); setFading(false); }, 210);
    return () => window.clearTimeout(t);
  }, [target, shown]);
  const lastPage = useRef<ReactNode>(children);
  if (!isTab) lastPage.current = children;

  const pagerOpaque = shown === "tab" && !fading;
  const pageMounted = shown === "page" || target === "page";
  const pageOpaque = shown === "page" && !fading;

  const vaultNav: VaultNav = { subIndex: vaultSub, onSub: goSub };

  return (
    <>
      {/* Pager stays mounted (tab state preserved); a non-tab page fades over it. */}
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
          // `live` = active section + its neighbours → those clients keep a realtime
          // channel; all panes still mount + load so every swipe is full-state.
          renderPane={(i, active) => paneFor(i, Math.abs(i - index) <= 1 && isTab, active && isTab, vaultNav)}
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

// ── Vault: sticky shared header + nested photos·to-dos·lists sub-pager ─────────
function VaultSection({ live, active, subIndex, onSub }: { live: boolean; active: boolean; subIndex: number; onSub: (j: number) => void }) {
  const indicator = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);

  // Pill follows the nested swipe live (imperative, no re-renders).
  const setPill = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(2, p));
    if (indicator.current) indicator.current.style.transform = `translateX(${clamped * 100}%)`;
    const near = Math.round(clamped);
    labels.current.forEach((el, i) => {
      if (el) el.style.color = i === near ? "var(--foreground)" : "var(--muted-foreground)";
    });
  }, []);
  useEffect(() => { setPill(subIndex); }, [subIndex, setPill]); // settle / external sync

  return (
    <div className="h-full flex flex-col">
      {/* Pinned shared header — part of the pane, so it slides in/out as one unit. */}
      <div className="flex-shrink-0 bg-background px-4 pt-10 pb-2.5 border-b border-border/30">
        <div className="max-w-lg mx-auto">
          <h1 className="font-heading text-3xl text-foreground tracking-tight mb-3">vault.</h1>
          <div className="relative flex bg-secondary/60 rounded-full p-1">
            <div
              ref={indicator}
              className="absolute top-1 left-1 bottom-1 rounded-full bg-card shadow-sm transition-transform"
              style={{ width: "calc((100% - 0.5rem) / 3)" }}
            />
            {VAULT_TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => { labels.current[i] = el; }}
                onClick={() => onSub(i)}
                className="relative z-10 flex-1 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{ color: "var(--muted-foreground)" }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nested sub-pager — contained so the inner gesture is never contested by
          the outer pager (that fight caused held sub-swipes to auto-settle/loop).
          Leave the vault via the bottom nav. */}
      <div className="flex-1 min-h-0">
        <SwipePager
          index={subIndex}
          count={3}
          className="h-full"
          onIndexChange={(j) => { if (j !== subIndex) onSub(j); }}
          onProgress={setPill}
          renderPane={(j, subActive) => (
            <FabGate active={active && subActive}>
              <div className="max-w-lg mx-auto pt-3">
                {j === 0 ? <VaultPhotos live={live && Math.abs(j - subIndex) <= 1} />
                  : j === 1 ? <VaultTodos live={live && Math.abs(j - subIndex) <= 1} />
                    : <VaultLists live={live && Math.abs(j - subIndex) <= 1} />}
              </div>
            </FabGate>
          )}
        />
      </div>
    </div>
  );
}
