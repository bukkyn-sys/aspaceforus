"use client";

import type { CSSProperties } from "react";
import { useSignedUrl } from "@/lib/use-signed-url";

/** <img> for a stored Supabase storage value — renders a signed URL so it works
 *  with private buckets. Drop-in replacement for <img src={stored} …>. */
export function SignedImg({
  src, alt = "", className, style,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const url = useSignedUrl(src);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className={className} style={style} /> : <div className={className} style={style} aria-hidden />;
}
