"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 py-12">
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="font-heading text-5xl text-foreground tracking-tight mb-2">us.</h1>
        <p className="text-muted-foreground text-sm">your shared space</p>
      </div>

      <div className="w-full max-w-sm">
        {sent ? (
          /* Success state */
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
          /* Email form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="rounded-xl h-12 bg-white border-border/60 text-base"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full h-12 rounded-xl text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "send magic link"
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              no password needed — just magic ✨
            </p>
          </form>
        )}
      </div>

      {/* Bottom note */}
      <p className="absolute bottom-8 text-xs text-muted-foreground">
        private — just the two of you.
      </p>
    </div>
  );
}
