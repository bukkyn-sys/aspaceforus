import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profileData } = await supabase.rpc("get_my_profile", { p_user_id: user.id });
  const profile = profileData as {
    id: string;
    couple_id: string | null;
    display_name: string | null;
    avatar_url: string | null;
    accent_color: string | null;
  } | null;

  if (!profile?.couple_id) redirect("/onboarding");

  const [{ data: coupleData }, { data: partnerData }] = await Promise.all([
    supabase
      .from("couples")
      .select("id, banner_url, started_at, invite_code, banner_focus")
      .eq("id", profile.couple_id)
      .single(),
    supabase.rpc("get_partner_profile", {
      p_couple_id: profile.couple_id,
      p_my_id: user.id,
    }),
  ]);

  const partnerAccentColor = (partnerData as { accent_color?: string | null } | null)?.accent_color ?? null;

  return (
    <ProfileClient
      initialProfile={{
        id: profile.id,
        coupleId: profile.couple_id,
        displayName: profile.display_name ?? "",
        avatarUrl: profile.avatar_url ?? null,
        accentColor: profile.accent_color ?? "sage",
      }}
      initialCouple={{
        bannerUrl: coupleData?.banner_url ?? null,
        inviteCode: coupleData?.invite_code ?? null,
        bannerFocus: coupleData?.banner_focus ?? 50,
      }}
      partnerAccentColor={partnerAccentColor}
    />
  );
}
