"use client";

import { Suspense, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SwipePager } from "@/components/swipe-pager";
import { FabGate } from "@/contexts/fab-context";
import PageTransition from "@/components/page-transition";
import DashboardClient from "@/app/(app)/home/dashboard-client";
import CalendarClient from "@/app/(app)/calendar/calendar-client";
import VaultClient from "@/app/(app)/vault/vault-client";
import LedgerClient from "@/app/(app)/ledger/ledger-client";

// The four bottom-nav tabs live together in one finger-tracked swipe pager so you
// can swipe between them live (home ↔ calendar ↔ vault ↔ ledger). They stay
// mounted (state + realtime preserved); the tab route pages render null and this
// shell owns their content. Non-tab routes (daily, profile, …) render normally.
const TABS = ["/home", "/calendar", "/vault", "/ledger"];

function tabPane(i: number) {
  switch (i) {
    case 0: return <DashboardClient />;
    case 1: return <CalendarClient />;
    case 2: return <VaultClient />;
    default: return <LedgerClient />;
  }
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tabIndex = TABS.indexOf(pathname);
  const isTab = tabIndex >= 0;
  const last = useRef(0);
  if (isTab) last.current = tabIndex;

  return (
    <>
      {/* Persistent tab swiper — hidden (but kept mounted) on non-tab routes. */}
      <div style={{ display: isTab ? undefined : "none" }} aria-hidden={!isTab}>
        <Suspense>
          <SwipePager
            index={isTab ? tabIndex : last.current}
            count={TABS.length}
            onIndexChange={(i) => { if (i !== tabIndex) router.replace(TABS[i]); }}
            renderPane={(i, active) => <FabGate active={active && isTab}>{tabPane(i)}</FabGate>}
          />
        </Suspense>
      </div>

      {/* Everything else (daily, profile, …) keeps the cross-fade transition. */}
      {!isTab && <PageTransition>{children}</PageTransition>}
    </>
  );
}
