"use server";

import { createClient } from "@/lib/supabase/server";

export async function savePushSubscription(
  userId: string,
  coupleId: string,
  subscription: object
) {
  const supabase = await createClient();
  await supabase.rpc("save_push_subscription", {
    p_user_id: userId,
    p_couple_id: coupleId,
    p_subscription: subscription,
  });
}
