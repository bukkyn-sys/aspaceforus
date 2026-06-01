"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

export async function addLedgerEntry(data: {
  coupleId: string;
  userId: string;
  title: string;
  amount: number;
  paidBy: string;
  splitRatio: number;
}) {
  const supabase = await createClient();
  await supabase.rpc("add_ledger_entry", {
    p_couple_id: data.coupleId,
    p_user_id: data.userId,
    p_paid_by: data.paidBy,
    p_title: data.title,
    p_amount: data.amount,
    p_split_ratio: data.splitRatio,
  });
  await notifyPartner(data.coupleId, data.userId, "us.", `your partner logged "${data.title}" — £${data.amount.toFixed(2)}`, "/ledger");
}

export async function settleAll(coupleId: string) {
  const supabase = await createClient();
  await supabase.rpc("settle_all", { p_couple_id: coupleId });
}

export async function addSavingsPot(data: {
  coupleId: string;
  userId: string;
  title: string;
  goalAmount: number;
  folderId: string;
}) {
  const supabase = await createClient();
  await supabase.from("savings_pots").insert({
    couple_id: data.coupleId,
    created_by: data.userId,
    folder_id: data.folderId,
    title: data.title,
    goal_amount: data.goalAmount,
    his_amount: 0,
    hers_amount: 0,
  });
}

export async function addPotFolder(data: {
  coupleId: string;
  userId: string;
  name: string;
  emoji: string;
  isDefault?: boolean;
}) {
  const supabase = await createClient();
  const { data: folder } = await supabase
    .from("pot_folders")
    .insert({
      couple_id: data.coupleId,
      created_by: data.userId,
      name: data.name,
      emoji: data.emoji,
      is_default: data.isDefault ?? false,
    })
    .select("id")
    .single();
  return folder?.id as string | undefined;
}

export async function deletePotFolder(id: string, coupleId: string) {
  const supabase = await createClient();
  await supabase
    .from("pot_folders")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("is_default", false);
}

export async function contributeToPot(potId: string, coupleId: string, userId: string, amount: number) {
  const supabase = await createClient();
  await supabase.rpc("contribute_to_pot", {
    p_pot_id: potId,
    p_couple_id: coupleId,
    p_user_id: userId,
    p_amount: amount,
  });
}

export async function deleteSavingsPot(potId: string, coupleId: string) {
  const supabase = await createClient();
  await supabase.rpc("delete_savings_pot", { p_pot_id: potId, p_couple_id: coupleId });
}
