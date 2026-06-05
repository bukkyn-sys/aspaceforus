"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

// Warm, lowercase, rotating nudges — never stale, never any answer text.
// {n} = the partner who just answered (from the recipient's point of view).
const NUDGES: ((n: string) => string)[] = [
  (n) => `your turn — ${n} answered today's.`,
  (n) => `${n} just shared today's — your turn whenever.`,
  () => `today's question is waiting for you two.`,
  (n) => `${n}'s in. your turn when you're ready.`,
  () => `one daily moment, half-finished.`,
];

export interface SubmitDailyInput {
  dayKey: string;
  body: string;
  option: string | null;
  coupleId: string;
  actorName: string;
}

/**
 * Write the caller's answer for the day they were shown, then — only if the
 * partner is genuinely still waiting (decided server-side, after commit) — fire
 * a content-free push. The reveal itself happens via the gated get_daily refetch
 * the partner runs after the broadcast; nothing here leaks answer text.
 */
export async function submitDaily(input: SubmitDailyInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const };

  const { data, error } = await supabase.rpc("submit_daily_response", {
    p_day_key: input.dayKey,
    p_body: input.body,
    p_option: input.option,
  });
  if (error) return { error: error.message };

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.should_notify === true) {
    const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)](input.actorName);
    await notifyPartner(input.coupleId, user.id, "us.", msg, "/home");
  }
  return { data: payload };
}
