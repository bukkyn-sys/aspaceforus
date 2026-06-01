import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profileData } = await supabase.rpc("get_my_profile", { p_user_id: user.id });
  const profile = profileData as {
    couple_id: string | null; display_name: string | null; avatar_url: string | null;
  } | null;

  if (profile?.couple_id) redirect("/home");

  const firstName = profile?.display_name?.split(" ")[0] ?? "";
  const avatar = profile?.avatar_url ?? null;
  const initialInvite = (await cookies()).get("pending_invite")?.value ?? null;

  return <OnboardingClient userId={user.id} firstName={firstName} avatar={avatar} initialInvite={initialInvite} />;
}
