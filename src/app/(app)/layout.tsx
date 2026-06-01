import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "@/components/bottom-nav";
import PushSubscribe from "@/components/push-subscribe";
import PullToRefresh from "@/components/pull-to-refresh";
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
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // getSession() reads the JWT from the cookie locally — no network call.
  // Middleware has already verified and refreshed the token, so this is safe.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) redirect("/auth/login");

  const { data: sessionData } = await supabase.rpc("get_session_data", { p_user_id: user.id });
  const sd = sessionData as SessionData | null;

  if (!sd?.me?.couple_id) redirect("/onboarding");

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
  };

  return (
    <FabProvider>
      <CoupleProvider value={coupleValue}>
        <NotificationProvider>
          <div className="min-h-dvh bg-background flex flex-col">
            <PushSubscribe userId={me.id} coupleId={sd.me.couple_id} />
            <PullToRefresh />
            <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]">
              {children}
            </main>
            <BottomNav />
          </div>
        </NotificationProvider>
      </CoupleProvider>
    </FabProvider>
  );
}
