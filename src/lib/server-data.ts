import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// React cache() deduplicates this across layout + page in the same render
export const getServerSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("get_my_profile", { p_user_id: user.id });
  const profile = data as { id: string; couple_id: string | null } | null;
  if (!profile?.couple_id) return null;
  return { supabase, userId: profile.id, coupleId: profile.couple_id };
});
