import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Server-side OAuth code exchange. Doing this on the server guarantees the
// session cookies are written to the response *before* we redirect, which
// avoids the race where the browser had a session but the server didn't yet,
// bouncing the user back to the login screen.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // /home; the (app) layout sends new users on to /onboarding.
      return NextResponse.redirect(`${origin}/home`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent("could not sign you in — please try again")}`);
}
