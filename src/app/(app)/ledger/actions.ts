"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

export async function addLedgerEntry(data: {
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
    couple_id: data.coupleId,
    created_by: uid,
    paid_by: data.paidBy,   // semantic — user chooses who paid
    title: data.title,
    amount: data.amount,
    split_ratio: data.splitRatio,
    category: data.category || null,
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
      title: data.title,
      amount: data.amount,
      paid_by: data.paidBy,
      split_ratio: data.splitRatio,
      category: data.category || null,
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
    couple_id: data.coupleId,
    created_by: uid,
    folder_id: data.folderId,
    title: data.title,
    goal_amount: data.goalAmount,
    target_date: data.targetDate || null,
    currency: data.currency || "£",
    emoji: data.emoji || null,
    his_amount: 0,
    hers_amount: 0,
  }).select("id").single();
  return row?.id as string | undefined;
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
  const current = parseFloat((iAmCreator ? pot.his_amount : pot.hers_amount) ?? "0");
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
      name: data.name,
      emoji: data.emoji,
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
