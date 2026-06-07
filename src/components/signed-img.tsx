"use client";

import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { useSignedUrl } from "@/lib/use-signed-url";

/** <img> for a stored Supabase storage value — renders a signed URL so it works
 *  with private buckets. When there's no value OR the image fails to load, it
 *  renders `fallback` (e.g. a placeholder) instead of a broken image / alt text. */
export function SignedImg({
  src, alt = "", className, style, fallback,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
}) {
  const url = useSignedUrl(src);
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [url]); // retry when the source changes

  if (!url || errored) {
    return fallback !== undefined ? <>{fallback}</> : <div className={className} style={style} aria-hidden />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} onError={() => setErrored(true)} />;
}
