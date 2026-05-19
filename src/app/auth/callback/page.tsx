"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackHandler() {
  const router = useRouter();
  const [status, setStatus] = useState("signing you in…");
  const [urlInfo, setUrlInfo] = useState("");

  useEffect(() => {
    // Show raw URL info so we can diagnose what Supabase sent back
    setUrlInfo(`search: ${window.location.search || "(empty)"} | hash: ${window.location.hash ? window.location.hash.substring(0, 60) + "…" : "(empty)"}`);

    const supabase = createClient();
    let settled = false;

    async function finish(userId: string, userMeta: Record<string, string>) {
      if (settled) return;
      settled = true;
      setStatus("syncing profile…");
      const displayName: string | null = userMeta.full_name || userMeta.name || null;
      const avatarUrl: string | null = userMeta.avatar_url || userMeta.picture || null;
      await supabase.from("profiles").upsert(
        { id: userId, display_name: displayName, avatar_url: avatarUrl },
        { onConflict: "id", ignoreDuplicates: false }
      );
      setStatus("done — redirecting…");
      window.location.href = "/home";
    }

    function fail(msg: string) {
      if (settled) return;
      settled = true;
      setStatus(`failed: ${msg}`);
      setTimeout(() => router.replace(`/auth/login?error=${encodeURIComponent(msg)}`), 1500);
    }

    // onAuthStateChange fires for BOTH flows:
    // - implicit: fired automatically when client detects hash tokens on init
    // - PKCE: fired after exchangeCodeForSession succeeds
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        finish(session.user.id, session.user.user_metadata ?? {});
      }
    });

    // PKCE flow: exchange the code if present
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      setStatus("got code, exchanging…");
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) fail(error.message);
        // success → onAuthStateChange fires SIGNED_IN above
      });
    }

    // Timeout: if nothing fires after 8s, something is deeply wrong
    const timeout = setTimeout(() => fail("timed out — no auth event received"), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-2 px-6">
      <p className="text-muted-foreground text-sm">{status}</p>
      {urlInfo && <p className="text-xs text-muted-foreground/60 text-center break-all max-w-sm">{urlInfo}</p>}
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">signing you in…</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
