import { NextResponse } from "next/server";

// Proxies external OG/thumbnail images through our own domain so they aren't
// blocked by hotlink protection or mixed-content rules on the client.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get("src");
  if (!src) return new NextResponse("missing src", { status: 400 });

  let url: URL;
  try { url = new URL(src); } catch { return new NextResponse("invalid url", { status: 400 }); }
  if (!["http:", "https:"].includes(url.protocol)) return new NextResponse("bad protocol", { status: 400 });

  try {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        "Referer": url.origin,
      },
    });
    if (!res.ok) return new NextResponse("upstream error", { status: 502 });
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!ct.startsWith("image/")) return new NextResponse("not an image", { status: 400 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  }
}
