import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every navigation so server components
// and server actions always see a valid token (the documented @supabase/ssr
// requirement). It does NOT guard routes — page access is already gated by the
// client AuthContext and, definitively, by RLS on every query. Keeping it
// refresh-only avoids interfering with the onboarding / auth flows.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touch the session so an expiring token is refreshed into the response cookies.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on app pages only — skip static assets, the PWA shell files, image
  // routes, and ALL /api routes (notably the Stripe webhook, which must reach
  // the handler with its raw body untouched).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|startup-image|icons|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)",
  ],
};
