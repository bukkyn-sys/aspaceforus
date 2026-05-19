"use server";

import { createClient } from "@/lib/supabase/server";

export async function markSectionActivity(userId: string, section: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_section_activity", { p_user_id: userId, p_section: section });
}
