"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push";

export async function addVaultItem(data: {
  coupleId: string;
  userId: string;
  type: "date_idea" | "wishlist";
  title: string;
  owner: "shared" | "his" | "hers";
  url?: string;
  notes?: string;
  priceRange?: string;
  ogImage?: string;
  ogTitle?: string;
}) {
  const supabase = await createClient();
  await supabase.rpc("add_vault_item", {
    p_couple_id: data.coupleId,
    p_user_id: data.userId,
    p_type: data.type,
    p_owner: data.owner,
    p_title: data.title,
    p_url: data.url || null,
    p_notes: data.notes || null,
    p_price_range: data.priceRange || null,
    p_og_image: data.ogImage || null,
    p_og_title: data.ogTitle || null,
  });
  const label = data.type === "wishlist" ? "wishlist" : "date ideas";
  await notifyPartner(data.coupleId, data.userId, "us.", `your partner added "${data.title}" to ${label}`, "/vault");
}

export async function updateVaultStage(
  id: string,
  coupleId: string,
  stage: "ideas" | "planned" | "completed"
) {
  const supabase = await createClient();
  await supabase.rpc("update_vault_stage", { p_id: id, p_couple_id: coupleId, p_stage: stage });
}

export async function updateVaultItem(data: {
  id: string;
  coupleId: string;
  title: string;
  url?: string;
  notes?: string;
  owner?: "shared" | "his" | "hers";
  priceRange?: string | null;
  ogImage?: string | null;
  ogTitle?: string | null;
}) {
  const supabase = await createClient();
  await supabase.rpc("update_vault_item", {
    p_id: data.id,
    p_couple_id: data.coupleId,
    p_title: data.title,
    p_url: data.url || null,
    p_notes: data.notes || null,
    p_owner: data.owner || null,
    p_price_range: data.priceRange ?? null,
    p_og_image: data.ogImage ?? null,
    p_og_title: data.ogTitle ?? null,
  });
}

export async function deleteVaultItem(id: string, coupleId: string) {
  const supabase = await createClient();
  await supabase.rpc("delete_vault_item", { p_id: id, p_couple_id: coupleId });
}

export async function fetchOgPreview(url: string): Promise<{ image: string | null; title: string | null }> {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return { image: null, title: null };
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)" },
    });
    if (!res.ok) return { image: null, title: null };
    const html = await res.text();
    const getOg = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))
        ?? html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, "i"));
      return m?.[1]?.trim() ?? null;
    };
    return { image: getOg("og:image"), title: getOg("og:title") };
  } catch {
    return { image: null, title: null };
  }
}
