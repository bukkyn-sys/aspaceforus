import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Verifies an email magic-link via token_hash (NOT a PKCE code). Because it's
// stateless, the link works even when opened in a different browser from the one
// that requested it — e.g. requested inside Instagram's in-app browser and opened
// in Safari from the email. That's what makes email sign-in work from any app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/home";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent("that sign-in link is invalid or expired — request a new one")}`,
  );
}
