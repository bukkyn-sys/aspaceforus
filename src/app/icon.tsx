import { ImageResponse } from "next/og";
import { INSTRUMENT_SERIF_B64 } from "./instrument-serif-font";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Font is embedded as base64 (no fetch / no fs / no URL) so the icon can never
// fail to render. Matches the app banner: Instrument Serif, tracking-tight.
const fontData = Uint8Array.from(atob(INSTRUMENT_SERIF_B64), (c) => c.charCodeAt(0)).buffer;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F9F8F6",
        }}
      >
        <span
          style={{
            fontFamily: "Instrument Serif",
            fontSize: 240,
            fontWeight: 400,
            color: "#2C2C2B",
            letterSpacing: "-0.025em",
            lineHeight: 1,
          }}
        >
          us.
        </span>
      </div>
    ),
    {
      width: 512,
      height: 512,
      fonts: [{ name: "Instrument Serif", data: fontData, style: "normal", weight: 400 }],
    }
  );
}
