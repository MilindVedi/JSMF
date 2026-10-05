import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default share-preview image for every route that doesn't define its own
 * (Next.js falls back to this automatically). Rendered with `next/og`
 * (Satori) rather than a static asset so it stays code — no binary image
 * asset to keep in sync with the brand — but Satori can't read CSS custom
 * properties or oklch(), so the palette below is a hardcoded approximation
 * of the design tokens in globals.css, not a live reference to them.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAF8FF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 20,
              backgroundColor: "#5B21B6",
              color: "#FAF8FF",
              fontSize: 48,
              fontWeight: 700,
            }}
          >
            J
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#22163A", letterSpacing: -2 }}>
            JSMF
          </div>
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#5E5670", textAlign: "center" }}>
          Memory-based PYQ preparation
        </div>
        <div style={{ marginTop: 8, fontSize: 32, color: "#5E5670", textAlign: "center" }}>
          NEET-PG · FMGE · INI-CET
        </div>
      </div>
    ),
    { ...size }
  );
}
