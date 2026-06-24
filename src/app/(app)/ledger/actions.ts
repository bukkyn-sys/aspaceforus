"use server";

import { getUid } from "@/lib/auth-server";
import { notifyPartner } from "@/lib/push";
import { clampText, clampRequired, LIMITS } from "@/lib/validate-input";

export async function addLedgerEntry(data: {
  id?: string;
  coupleId: string;
  userId: string;
  title: string;
  amount: number;
  paidBy: string;
  splitRatio: number;
  category?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("ledger_entries").insert({
    ...(data.id ? { id: data.id } : {}),
    couple_id: data.coupleId,
    created_by: uid,
    paid_by: data.paidBy,   // semantic — user chooses who paid
    title: clampRequired(data.title, LIMITS.title),
    amount: data.amount,
    split_ratio: data.splitRatio,
    category: clampText(data.category, LIMITS.category),
    recurrence: data.recurrence ?? "none",
    settled: false,
  });
  await notifyPartner(data.coupleId, uid, "us.", `your partner logged "${data.title}" — £${data.amount.toFixed(2)}`, "/ledger");
}

export async function settleAll(coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("ledger_entries")
    .update({ settled: true, settled_at: new Date().toISOString() })
    .eq("couple_id", coupleId)
    .eq("settled", false)
    .eq("recurrence", "none");
}

export async function updateLedgerEntry(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  amount: number;
  paidBy: string;
  splitRatio: number;
  category?: string | null;
  recurrence?: "none" | "weekly" | "monthly";
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("ledger_entries")
    .update({
      title: clampRequired(data.title, LIMITS.title),
      amount: data.amount,
      paid_by: data.paidBy,
      split_ratio: data.splitRatio,
      category: clampText(data.category, LIMITS.category),
      recurrence: data.recurrence ?? "none",
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId)
    .eq("created_by", uid);
}

export async function deleteLedgerEntry(id: string, coupleId: string, userId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("ledger_entries")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", uid);
}

export async function addSavingsPot(data: {
  id?: string;
  coupleId: string;
  userId: string;
  title: string;
  goalAmount: number;
  folderId: string;
  targetDate?: string | null;
  currency?: string;
  emoji?: string | null;
}): Promise<string | undefined> {
  const { supabase, uid } = await getUid();
  if (!uid) return undefined;
  const { data: row } = await supabase.from("savings_pots").insert({
    ...(data.id ? { id: data.id } : {}),
    couple_id: data.coupleId,
    created_by: uid,
    folder_id: data.folderId,
    title: clampRequired(data.title, LIMITS.title),
    goal_amount: data.goalAmount,
    target_date: data.targetDate || null,
    currency: clampText(data.currency, LIMITS.currency) || "£",
    emoji: clampText(data.emoji, LIMITS.emoji),
    his_amount: 0,
    hers_amount: 0,
  }).select("id").single();
  return row?.id as string | undefined;
}

export async function updateSavingsPot(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  goalAmount: number;
  targetDate?: string | null;
  currency?: string;
  emoji?: string | null;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Pots are couple-shared: either partner may edit (couple-scoped, like delete).
  await supabase
    .from("savings_pots")
    .update({
      title: clampRequired(data.title, LIMITS.title),
      goal_amount: data.goalAmount,
      target_date: data.targetDate || null,
      currency: clampText(data.currency, LIMITS.currency) || "£",
      emoji: clampText(data.emoji, LIMITS.emoji),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId);
}

export async function contributeToPot(potId: string, coupleId: string, userId: string, delta: number) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data: pot } = await supabase
    .from("savings_pots")
    .select("his_amount, hers_amount, created_by")
    .eq("id", potId)
    .eq("couple_id", coupleId)
    .single();
  if (!pot) return;
  const iAmCreator = pot.created_by === uid;
  const current = (iAmCreator ? pot.his_amount : pot.hers_amount) ?? 0;
  const next = Math.max(0, current + delta);
  await supabase
    .from("savings_pots")
    .update(iAmCreator ? { his_amount: next } : { hers_amount: next })
    .eq("id", potId)
    .eq("couple_id", coupleId);
}

export async function deleteSavingsPot(potId: string, coupleId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("savings_pots").delete().eq("id", potId).eq("couple_id", coupleId);
}

// Pin / unpin a pot to the Home dashboard (couple-shared, like editing).
export async function setPotPinned(potId: string, coupleId: string, pinned: boolean) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("savings_pots").update({ pinned }).eq("id", potId).eq("couple_id", coupleId);
}

export async function addPotFolder(data: {
  coupleId: string;
  userId: string;
  name: string;
  emoji: string;
  isDefault?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data: folder } = await supabase
    .from("pot_folders")
    .insert({
      couple_id: data.coupleId,
      created_by: uid,
      name: clampRequired(data.name, LIMITS.name),
      emoji: clampText(data.emoji, LIMITS.emoji) ?? undefined,
      is_default: data.isDefault ?? false,
    })
    .select("id")
    .single();
  return folder?.id as string | undefined;
}

export async function deletePotFolder(id: string, coupleId: string, defaultFolderId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  if (id === defaultFolderId) return;
  await supabase
    .from("savings_pots")
    .update({ folder_id: defaultFolderId })
    .eq("folder_id", id)
    .eq("couple_id", coupleId);
  await supabase
    .from("pot_folders")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("is_default", false);
}
