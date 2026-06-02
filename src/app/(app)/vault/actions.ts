"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

type VaultKind = "date_idea" | "wishlist" | "general";

export async function addVaultFolder(data: {
  coupleId: string;
  userId: string;
  name: string;
  emoji: string;
  kind: VaultKind;
  isDefault?: boolean;
}) {
  const supabase = await createClient();
  const { data: folder } = await supabase
    .from("vault_folders")
    .insert({
      couple_id: data.coupleId,
      created_by: data.userId,
      name: data.name,
      emoji: data.emoji,
      kind: data.kind,
      is_default: data.isDefault ?? false,
    })
    .select("id")
    .single();
  return folder?.id as string | undefined;
}

export async function deleteVaultFolder(id: string, coupleId: string) {
  const supabase = await createClient();
  await supabase
    .from("vault_folders")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("is_default", false);
}

export async function addVaultItem(data: {
  coupleId: string;
  userId: string;
  folderId: string;
  folderKind: VaultKind;
  title: string;
  owner: string;
  url?: string;
  notes?: string;
  priceRange?: string;
  ogImage?: string;
  ogTitle?: string;
  itemEmoji?: string;
}) {
  const supabase = await createClient();
  await supabase.from("vault_items").insert({
    couple_id: data.coupleId,
    created_by: data.userId,
    folder_id: data.folderId,
    type: data.folderKind === "date_idea" ? "date_idea" : data.folderKind === "wishlist" ? "wishlist" : "general",
    owner: data.owner,
    title: data.title,
    url: data.url || null,
    notes: data.notes || null,
    price_range: data.priceRange || null,
    og_image: data.ogImage || null,
    og_title: data.ogTitle || null,
    item_emoji: data.itemEmoji || null,
    stage: "ideas",
  });
  await notifyPartner(
    data.coupleId,
    data.userId,
    "us.",
    `your partner added "${data.title}" to the vault`,
    "/vault"
  );
}

// Stage / edit / delete are restricted to the item's creator — partners can't
// modify each other's entries (the created_by filter enforces this server-side).
export async function updateVaultStage(
  id: string,
  coupleId: string,
  userId: string,
  stage: "ideas" | "planned" | "completed"
) {
  const supabase = await createClient();
  await supabase
    .from("vault_items")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", userId);
}

export async function updateVaultItem(data: {
  id: string;
  coupleId: string;
  userId: string;
  title: string;
  url?: string;
  notes?: string;
  owner?: string;
  priceRange?: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
  itemEmoji?: string | null;
}) {
  const supabase = await createClient();
  await supabase
    .from("vault_items")
    .update({
      title: data.title,
      url: data.url || null,
      notes: data.notes || null,
      owner: data.owner || null,
      price_range: data.priceRange ?? null,
      og_image: data.ogImage ?? null,
      og_title: data.ogTitle ?? null,
      item_emoji: data.itemEmoji ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("couple_id", data.coupleId)
    .eq("created_by", data.userId);
}

export async function deleteVaultItem(id: string, coupleId: string, userId: string) {
  const supabase = await createClient();
  await supabase
    .from("vault_items")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", userId);
}
