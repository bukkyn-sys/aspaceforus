import { ImageResponse } from "next/og";
import { INSTRUMENT_SERIF_B64 } from "../../instrument-serif-font";

// iOS launch screen for the installed PWA. iOS ignores the web manifest's
// background_color entirely — it only paints an `apple-touch-startup-image`
// whose media query matches the device exactly. Without one it shows a black
// screen for the whole cold boot, hence the "long black beat" before the app.
// We render the splash on demand (iOS caches it after first fetch).
export const runtime = "edge";

const fontData = Uint8Array.from(atob(INSTRUMENT_SERIF_B64), (c) => c.charCodeAt(0)).buffer;

export async function GET(_req: Request, { params }: { params: Promise<{ spec: string }> }) {
  // spec = "<w>x<h>" for light, "<w>x<h>d" for dark (e.g. 1170x2532 / 1170x2532d).
  const { spec } = await params;
  const m = /^(\d+)x(\d+)(d)?$/.exec(spec);
  const w = m ? Number(m[1]) : 1170;
  const h = m ? Number(m[2]) : 2532;
  const dark = !!(m && m[3]);
  const bg = dark ? "#1A1A18" : "#F9F8F6";
  const fg = dark ? "#E8E6E2" : "#2C2C2B";
  const fontSize = Math.round(Math.min(w, h) * 0.17);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
        }}
      >
        <span
          style={{
            fontFamily: "Instrument Serif",
            fontSize,
            fontWeight: 400,
            color: fg,
            letterSpacing: "-0.025em",
            lineHeight: 1,
          }}
        >
          us.
        </span>
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: [{ name: "Instrument Serif", data: fontData, style: "normal", weight: 400 }],
    }
  );
}
