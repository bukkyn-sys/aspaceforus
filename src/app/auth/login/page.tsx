"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// Returns true when running inside a WebView / in-app browser (Instagram,
// WhatsApp, Facebook, TikTok, Line, Snapchat, etc.) where Google OAuth is blocked.
// `Line` is anchored on the trailing slash (its UA is "… Line/12.x") so it
// doesn't false-match substrings like "online".
function isWebView(): boolean {
  // Dev simulation: force the banner without a real in-app browser.
  if (process.env.NEXT_PUBLIC_FORCE_WEBVIEW === "true") return true;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /Instagram|FBAN|FBAV|FB_IAB|Twitter|TikTok|Snapchat|WhatsApp|Line\/|LinkedInApp|MicroMessenger/i.test(ua) ||
    // Android WebView
    (/Android/.test(ua) && /wv\)/.test(ua)) ||
    // iOS in-app browser: has WebKit but not Safari in UA
    (/iPhone|iPad/.test(ua) && !/Safari/.test(ua) && /AppleWebKit/.test(ua))
  );
}

// Banner shown inside in-app browsers, where Google OAuth is blocked. We can't
// stay in the webview — the user has to get out into Safari/Chrome. On Android
// we can hand the URL straight to a real browser via an intent; on iOS there's
// no programmatic escape, so we guide them to the in-app "open in browser" menu
// and give a copy-link fallback that works everywhere.
function OpenInBrowserBanner() {
  const [copied, setCopied] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsAndroid(/Android/.test(ua));
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
  }, []);

  function copy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openInChrome() {
    // intent:// hands the https URL to a full Android browser, escaping the webview.
    const bare = window.location.href.replace(/^https?:\/\//, "");
    window.location.href = `intent://${bare}#Intent;scheme=https;end`;
  }

  return (
    <div className="w-full max-w-xs space-y-4 text-center">
      <div className="bg-secondary rounded-2xl px-5 py-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">open in your browser to sign in</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isIOS
            ? "Google sign-in doesn’t work inside in-app browsers. Tap the menu (•••) in the corner, then “Open in Safari”."
            : "Google sign-in doesn’t work inside in-app browsers. Open this page in Chrome to continue."}
        </p>

        {isAndroid && (
          <Button
            type="button"
            onClick={openInChrome}
            className="w-full h-11 rounded-xl text-sm font-medium gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            open in Chrome
          </Button>
        )}

        <button
          onClick={copy}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-foreground text-background text-sm font-medium transition-opacity active:opacity-70"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "link copied — paste it in your browser" : "copy link"}
        </button>
      </div>
    </div>
  );
}

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inWebView, setInWebView] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setInWebView(isWebView());
    const urlError = searchParams.get("error");
    if (urlError) setError(decodeURIComponent(urlError));
  }, [searchParams]);

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  if (inWebView) return <OpenInBrowserBanner />;

  return (
    <div className="w-full max-w-xs space-y-4">
      {error && (
        <p className="text-sm text-destructive text-center break-words">{error}</p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full h-12 rounded-xl text-sm font-medium border-border/60 bg-card gap-3"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
        continue with Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-12 text-center">
        <h1 className="font-heading text-5xl text-foreground tracking-tight mb-2">us.</h1>
        <p className="text-muted-foreground text-sm">just the two of you</p>
      </div>

      <Suspense fallback={<div className="w-full max-w-xs h-12" />}>
        <LoginForm />
      </Suspense>

      <p className="absolute bottom-8 text-xs text-muted-foreground">
        completely private.
      </p>
    </div>
  );
}
