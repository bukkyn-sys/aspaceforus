import { NextResponse } from "next/server";

// Entry point for a scanned invite QR. Stashes the code in a short-lived cookie
// (so it survives the sign-in redirect), then sends the user into the app. Once
// signed in with no couple yet, onboarding reads the cookie and pre-fills join.
//
// WebView handling: this is a server redirect with no UI. A signed-out visitor
// (which a WebView user always is — Google OAuth can't complete in an in-app
// browser) is routed `/join` -> `/` -> `/auth/login`, where the client-side
// WebView detection + "open in your browser / copy link" banner runs. So the
// fallback is enforced for the QR-scan entry path via that destination.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const res = NextResponse.redirect(`${origin}/`);
  if (code) {
    res.cookies.set("pending_invite", code.toLowerCase(), { maxAge: 1800, path: "/" });
  }
  return res;
}
