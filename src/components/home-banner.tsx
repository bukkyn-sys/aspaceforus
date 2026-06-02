"use client";

import { cn } from "@/lib/utils";
import { useSignedUrl } from "@/lib/use-signed-url";

const HEIGHT = 130;

/** Sticky header banner — fixed height, always-on shadow. No collapse. */
export function HomeBanner({ bannerUrl, focus = 50 }: { bannerUrl: string | null; focus?: number }) {
  const signedUrl = useSignedUrl(bannerUrl);
  return (
    <div
      className="sticky top-0 z-20 w-full overflow-hidden bg-secondary flex-shrink-0"
      style={{ height: HEIGHT, boxShadow: "0 4px 16px -4px rgba(0,0,0,0.32)" }}
    >
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signedUrl ?? ""}
          alt="couple"
          className="w-full h-full object-cover"
          style={{ objectPosition: `50% ${focus}%` }}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-secondary to-background" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/0 to-black/15" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p className={cn(
          "font-heading text-[48px] tracking-tight select-none leading-none",
          bannerUrl ? "text-white drop-shadow" : "text-foreground/20"
        )}>us.</p>
      </div>
    </div>
  );
}
