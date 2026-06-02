"use client";

// Top-level fallback — replaces the root layout if it (or its data fetch) throws,
// so it can't rely on globals.css/Tailwind. Inline styles only.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "0 1.5rem",
          textAlign: "center",
          background: "#F9F8F6",
          color: "#3a3a38",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.75rem", fontWeight: 500 }}>us.</p>
        <p style={{ fontSize: "0.9rem", color: "#7a7a76", maxWidth: "18rem", lineHeight: 1.5 }}>
          something went wrong loading the app. your data is safe — try again.
        </p>
        <button
          onClick={reset}
          style={{
            height: "2.75rem",
            padding: "0 1.5rem",
            borderRadius: "0.75rem",
            border: "none",
            background: "#3a3a38",
            color: "#F9F8F6",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          try again
        </button>
      </body>
    </html>
  );
}
