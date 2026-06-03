"use client";

import { Suspense, useState, useEffect, useRef, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Check, ArrowLeft } from "lucide-react";

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
  // Dev simulation: force the in-app-browser path without a real webview.
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

const RESEND_SECONDS = 40;

// Email 6-digit-code sign-in. Available in every browser so an account made with
// email is always reachable, and so it works inside in-app browsers where Google
// OAuth is blocked — the whole flow happens in one window, no browser hop.
function EmailCodeForm() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  function startCooldown() {
    setResendIn(RESEND_SECONDS);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1 && tickRef.current) { clearInterval(tickRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function sendCode(addr: string) {
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: addr });
    setSending(false);
    if (error) { setError(error.message); return false; }
    startCooldown();
    return true;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    const ok = await sendCode(addr);
    if (ok) { setCode(""); setStep("code"); }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) return;
    setVerifying(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) {
      setVerifying(false);
      setError("that code is wrong or expired — try again or resend.");
      return;
    }
    // Full navigation so the freshly-written session cookies reach the server,
    // which routes new users on to onboarding. (Same reasoning as /auth/callback.)
    window.location.href = "/home";
  }

  if (step === "code") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setStep("email"); setError(null); }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground active:opacity-70"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> back
        </button>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          we emailed a 6-digit code to{" "}
          <span className="font-medium text-foreground break-all">{email.trim()}</span>
        </p>

        {error && <p className="text-sm text-destructive text-center break-words">{error}</p>}

        <form onSubmit={handleVerify} className="space-y-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="h-14 rounded-xl bg-card border-border/60 text-center text-2xl tracking-[0.4em] font-semibold"
          />
          <Button type="submit" disabled={verifying || code.trim().length < 6} className="w-full h-12 rounded-xl text-sm font-medium gap-2">
            {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
            verify & sign in
          </Button>
        </form>

        <div className="text-center">
          <button
            onClick={() => sendCode(email.trim())}
            disabled={resendIn > 0 || sending}
            className="text-xs text-muted-foreground underline underline-offset-2 disabled:no-underline disabled:opacity-60"
          >
            {sending ? "sending…" : resendIn > 0 ? `resend code in ${resendIn}s` : "resend code"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="space-y-2">
      {error && <p className="text-sm text-destructive text-center break-words">{error}</p>}
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your email"
        className="h-12 rounded-xl bg-card border-border/60 text-base text-center"
      />
      <Button type="submit" disabled={sending || !email.trim()} className="w-full h-12 rounded-xl text-sm font-medium gap-2">
        {sending && <Loader2 className="w-4 h-4 animate-spin" />}
        email me a code
      </Button>
    </form>
  );
}

// Shown inside in-app browsers: Google can't run here, so point the user to a
// full browser (with a copy-link they can paste into Safari/Chrome) if they'd
// rather use Google than the email code.
function GoogleInBrowserHint() {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3 text-center space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Want to use Google instead? It only works in a full browser — open this page in Safari or Chrome.
      </p>
      <button
        onClick={copy}
        className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-foreground active:opacity-70"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "link copied" : "copy link"}
      </button>
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

  return (
    <div className="w-full max-w-xs space-y-4">
      {error && (
        <p className="text-sm text-destructive text-center break-words">{error}</p>
      )}

      {/* Google — only in real browsers; in-app browsers block OAuth */}
      {!inWebView && (
        <>
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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-xs text-muted-foreground/60">or</span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        </>
      )}

      {/* Email code — available everywhere, so an email account is always reachable */}
      <EmailCodeForm />

      {/* Inside an in-app browser, tell them Google is available in a real browser */}
      {inWebView && <GoogleInBrowserHint />}
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
