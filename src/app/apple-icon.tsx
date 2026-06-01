import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const fontPromise = fetch(new URL("./InstrumentSerif-Regular.ttf", import.meta.url)).then((r) => r.arrayBuffer());

export default async function AppleIcon() {
  const font = await fontPromise;
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
      fonts: [{ name: "Instrument Serif", data: font, style: "normal", weight: 400 }],
    }
  );
}
