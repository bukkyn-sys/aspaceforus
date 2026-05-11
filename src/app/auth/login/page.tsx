"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setLoadingGoogle(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoadingGoogle(false); }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoadingMagic(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoadingMagic(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="font-heading text-5xl text-foreground tracking-tight mb-2">us.</h1>
        <p className="text-muted-foreground text-sm">your shared space</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-sage-light rounded-full flex items-center justify-center mx-auto">
              <Heart className="w-6 h-6 text-sage" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">check your inbox</p>
              <p className="text-sm text-muted-foreground">
                we sent a magic link to <span className="text-foreground">{email}</span>
              </p>
            </div>
            <button
              onClick={() => setSent(false)}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              use a different email
            </button>
          </div>
        ) : (
          <>
            {/* Google */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={loadingGoogle || loadingMagic}
              className="w-full h-12 rounded-xl text-sm font-medium border-border/60 bg-white gap-3"
            >
              {loadingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
              continue with Google
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Magic link */}
            <form onSubmit={handleMagicLink} className="space-y-3">
              <Input
                type="email"
                placeholder="your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded-xl h-12 bg-white border-border/60 text-base"
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={loadingMagic || loadingGoogle || !email}
                className="w-full h-12 rounded-xl text-sm font-medium"
              >
                {loadingMagic ? <Loader2 className="w-4 h-4 animate-spin" /> : "send magic link"}
              </Button>
            </form>
          </>
        )}
      </div>

      <p className="absolute bottom-8 text-xs text-muted-foreground">
        private — just the two of you.
      </p>
    </div>
  );
}
