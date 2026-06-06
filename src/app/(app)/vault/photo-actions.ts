"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

async function getUid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, uid: user?.id ?? null };
}

export async function addPhoto(data: {
  coupleId: string;
  path: string;
  width: number;
  height: number;
  caption?: string | null;
}) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  const { data: row } = await supabase
    .from("vault_photos")
    .insert({
      couple_id: data.coupleId,
      created_by: uid,
      path: data.path,
      width: data.width,
      height: data.height,
      caption: data.caption || null,
    })
    .select("id")
    .single();
  // One nudge per upload burst (the 10-min throttle collapses a batch).
  await notifyPartner(data.coupleId, uid, "us.", "your partner added a photo", "/vault?tab=photos");
  return row?.id as string | undefined;
}

export async function updatePhotoCaption(id: string, coupleId: string, caption: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_photos").update({ caption: caption || null }).eq("id", id).eq("couple_id", coupleId);
}

export async function deletePhoto(id: string, coupleId: string, path: string) {
  const { supabase, uid } = await getUid();
  if (!uid) return;
  await supabase.from("vault_photos").delete().eq("id", id).eq("couple_id", coupleId);
  await supabase.storage.from("photos").remove([path]);
}
