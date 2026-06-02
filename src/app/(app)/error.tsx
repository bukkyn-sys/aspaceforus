"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console so it shows in logs; no PII in the message.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-4">
      <p className="font-heading text-3xl text-foreground tracking-tight">a small hiccup.</p>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        something didn&apos;t load right — your data is safe. give it another go.
      </p>
      <button
        onClick={reset}
        className="h-11 px-6 rounded-xl bg-foreground text-background text-sm font-medium active:scale-95 transition-transform"
      >
        try again
      </button>
    </div>
  );
}
