import { ImageResponse } from "next/og";
import { INSTRUMENT_SERIF_B64 } from "./instrument-serif-font";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const fontData = Uint8Array.from(atob(INSTRUMENT_SERIF_B64), (c) => c.charCodeAt(0)).buffer;

export default function AppleIcon() {
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
            fontSize: 86,
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
      width: 180,
      height: 180,
      fonts: [{ name: "Instrument Serif", data: fontData, style: "normal", weight: 400 }],
    }
  );
}
