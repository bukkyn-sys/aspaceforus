import { createClient } from "@/lib/supabase/server";

/** Server-side: a Supabase client + the validated current user id (or null). */
export async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}
