import { cn } from "@/lib/utils";

/** The condensed banner bar shown once the full home banner scrolls away — a
 *  thin crop of the couple photo with the "us." wordmark. Also used in profile
 *  to preview what the condensed header will look like before saving a banner. */
export function BannerCondensed({ bannerUrl, focus = 50, className }: { bannerUrl: string | null; focus?: number; className?: string }) {
  return (
    <div className={cn("relative w-full h-14 overflow-hidden bg-background", className)}>
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bannerUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `50% ${focus}%` }} />
      ) : (
        <div className="w-full h-full bg-gradient-to-b from-secondary to-background" />
      )}
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 flex items-center justify-center">
        <p className={cn(
          "font-heading text-2xl tracking-tight select-none",
          bannerUrl ? "text-white drop-shadow" : "text-foreground/40"
        )}>us.</p>
      </div>
    </div>
  );
}
