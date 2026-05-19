import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
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
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 72,
          fontWeight: 400,
          color: "#2C2C2B",
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        us.
      </span>
    </div>,
    { width: 180, height: 180 }
  );
}
