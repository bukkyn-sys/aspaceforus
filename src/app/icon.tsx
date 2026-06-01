import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Instrument Serif (the app's title font) is bundled in the repo and loaded as
// a local asset via import.meta.url — no network call, so the icon can never
// fail to render. Matches the banner exactly.
const fontPromise = fetch(new URL("./InstrumentSerif-Regular.ttf", import.meta.url)).then((r) => r.arrayBuffer());

export default async function Icon() {
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
      fonts: [{ name: "Instrument Serif", data: font, style: "normal", weight: 400 }],
    }
  );
}
