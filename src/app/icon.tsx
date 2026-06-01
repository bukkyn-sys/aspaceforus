import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Load the app's title font (Instrument Serif) so the icon's "us." matches the
// brand. Falls back to Georgia if the font can't be fetched.
async function loadTitleFont(): Promise<ArrayBuffer | null> {
  try {
    return await fetch(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"
    ).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Icon() {
  const font = await loadTitleFont();
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
            fontFamily: font ? "Instrument Serif" : "Georgia, 'Times New Roman', serif",
            fontSize: 240,
            fontWeight: 400,
            color: "#2C2C2B",
            letterSpacing: "-0.04em",
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
      fonts: font ? [{ name: "Instrument Serif", data: font, style: "normal", weight: 400 }] : undefined,
    }
  );
}
