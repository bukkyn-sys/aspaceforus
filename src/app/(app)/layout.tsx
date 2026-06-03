import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/bottom-nav";
import PushSubscribe from "@/components/push-subscribe";
import PullToRefresh from "@/components/pull-to-refresh";
import PageTransition from "@/components/page-transition";
import Toaster from "@/components/toaster";
import OfflineBanner from "@/components/offline-banner";
import { CoupleProvider } from "@/contexts/couple-context";
import { FabProvider } from "@/contexts/fab-context";
import { NotificationProvider } from "@/contexts/notification-context";
import type { CoupleContextValue, UserProfile } from "@/contexts/couple-context";

type ProfileRow = {
  id: string;
  couple_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string | null;
};

type SessionData = {
  me: ProfileRow | null;
  partner: (ProfileRow & { couple_id: string }) | null;
  currency: string | null;
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Use getUser() (not getSession()): it validates the token and guarantees the
  // client carries a fresh access token into the rpc below. getSession() only
  // decodes the cookie locally, so a stale token would make auth.uid() null
  // inside the hardened get_session_data — it would raise, null the result, and
  // bounce us to /onboarding even though a couple exists (redirect loop).
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: sessionData, error: sessionError } = await supabase.rpc("get_session_data", { p_user_id: user.id });
  const sd = sessionData as SessionData | null;

  // A valid user but a failed rpc must NOT bounce to onboarding — that's the
  // redirect loop. Surface the error instead. Only a clean "no couple" result
  // means the user genuinely needs onboarding.
  // A valid user but a failed rpc must NOT bounce to onboarding (that was the
  // redirect loop) — surface it. A clean "no couple" result is a genuine new user.
  if (sessionError) throw new Error(sessionError.message);
  if (!sd?.me?.couple_id) redirect("/onboarding");

  // currency now comes from get_session_data (no extra couples query).
  const currency = sd.currency ?? "£";

  const me: UserProfile = {
    id: sd.me.id,
    couple_id: sd.me.couple_id,
    display_name: sd.me.display_name,
    avatar_url: sd.me.avatar_url,
    accent_color: sd.me.accent_color,
  };

  const partner: UserProfile | null = sd.partner
    ? {
        id: sd.partner.id,
        couple_id: sd.partner.couple_id,
        display_name: sd.partner.display_name,
        avatar_url: sd.partner.avatar_url,
        accent_color: sd.partner.accent_color,
      }
    : null;

  const coupleValue: CoupleContextValue = {
    coupleId: sd.me.couple_id,
    me,
    partner,
    myName: sd.me.display_name?.split(" ")[0] ?? "you",
    partnerName: sd.partner?.display_name?.split(" ")[0] ?? "partner",
    currency,
  };

  return (
    <FabProvider>
      <CoupleProvider value={coupleValue}>
        <NotificationProvider>
          <div className="min-h-dvh bg-background flex flex-col">
            <PushSubscribe userId={me.id} coupleId={sd.me.couple_id} />
            <PullToRefresh />
            <Toaster />
            <OfflineBanner />
            <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
              <PageTransition>{children}</PageTransition>
            </main>
            <BottomNav />
            {/* Cold-start splash — bg + wordmark, dissolves into the app (CSS only). */}
            <div
              className="us-splash fixed inset-0 z-[100] flex items-center justify-center bg-background pointer-events-none"
              aria-hidden
            >
              <span className="font-heading text-5xl text-foreground tracking-tight">us.</span>
            </div>
          </div>
        </NotificationProvider>
      </CoupleProvider>
    </FabProvider>
  );
}
