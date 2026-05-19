import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function notifyPartner(
  coupleId: string,
  myId: string,
  title: string,
  body: string,
  url = "/home"
) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_partner_push_subscription", {
      p_couple_id: coupleId,
      p_my_id: myId,
    });
    if (!data) return;
    await webpush.sendNotification(
      data as webpush.PushSubscription,
      JSON.stringify({ title, body, url })
    );
  } catch {
    // Subscription expired or partner hasn't subscribed — silent fail
  }
}
