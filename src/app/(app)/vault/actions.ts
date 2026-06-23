"use server";

import { getUid } from "@/lib/auth-server";
import { notifyPartner } from "@/lib/push";

type VaultKind = "date_idea" | "wishlist" | "general";

export async function addVaultFolder(data: {
  id?: string;
  coupleId: string;
  userId: string;
  name: string;
  emoji: string;
  kind: VaultKind;
  isDefault?: boolean;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Insert with the client id so items added to a brand-new folder reference a
  // real folder row (otherwise the FK fails and the folder reads empty later).
  const { data: folder } = await supabase
    .from("vault_folders")
    .insert({
      ...(data.id ? { id: data.id } : {}),
      couple_id: data.coupleId,
      created_by: uid,
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
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Default folders are deletable too (they're seeded once at couple creation,
  // not re-seeded) — so no is_default guard here.
  await supabase
    .from("vault_folders")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId);
}

export async function addVaultItem(data: {
  id?: string;
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
  const { supabase, uid } = await getUid();
  if (!uid) return;
  // Insert with the client id so editing a just-added item targets the real row.
  await supabase.from("vault_items").insert({
    ...(data.id ? { id: data.id } : {}),
    couple_id: data.coupleId,
    created_by: uid,
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
    uid,
    "us.",
    `your partner added "${data.title}" to the vault`,
    "/vault"
  );
}

export async function updateVaultStage(
  id: string,
  coupleId: string,
  userId: string,
  stage: "ideas" | "planned" | "completed"
) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("vault_items")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", uid);
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
  const { supabase, uid } = await getUid();
  if (!uid) return;
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
    .eq("created_by", uid);
}

export async function deleteVaultItem(id: string, coupleId: string, userId: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase
    .from("vault_items")
    .delete()
    .eq("id", id)
    .eq("couple_id", coupleId)
    .eq("created_by", uid);
}
