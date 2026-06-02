"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Pull {bucket, path} out of a stored Supabase storage URL (public or signed).
function parseStorageUrl(stored: string): { bucket: string; path: string } | null {
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

// Module-level cache so the same image isn't re-signed across components/renders.
const cache = new Map<string, string>();
const EXPIRY = 60 * 60 * 8; // 8h — re-signed on each mount/navigation anyway.

/**
 * Returns a usable image URL for a stored value. For Supabase storage URLs it
 * returns a signed URL (works whether the bucket is public or private, so we can
 * ship this before flipping buckets to private). Non-storage URLs pass through.
 */
export function useSignedUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (stored ? cache.get(stored) ?? null : null));

  useEffect(() => {
    if (!stored) { setUrl(null); return; }
    const cached = cache.get(stored);
    if (cached) { setUrl(cached); return; }

    const parsed = parseStorageUrl(stored);
    if (!parsed) { setUrl(stored); return; } // external / already a path — use as-is

    let active = true;
    createClient().storage.from(parsed.bucket).createSignedUrl(parsed.path, EXPIRY)
      .then(({ data }) => {
        if (!active) return;
        const signed = data?.signedUrl;
        if (signed) { cache.set(stored, signed); setUrl(signed); }
        else setUrl(stored); // fall back to the original (still works while bucket is public)
      })
      .catch(() => { if (active) setUrl(stored); });

    return () => { active = false; };
  }, [stored]);

  return url;
}
