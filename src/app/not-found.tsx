import Link from "next/link";

// Custom 404 — matches the brand + the error.tsx tone. Server component (no
// client JS needed); a plain link back into the app.
export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-4">
      <p className="font-heading text-3xl text-foreground tracking-tight">lost the thread.</p>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        this page doesn&apos;t exist — or it moved. let&apos;s get you back home.
      </p>
      <Link
        href="/home"
        className="h-11 px-6 inline-flex items-center rounded-xl bg-foreground text-background text-sm font-medium active:scale-95 transition-transform"
      >
        back home
      </Link>
    </div>
  );
}
