import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Rune — Write more. Fear less.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          background: "#1a1614",
        }}
      >
        {/* Subtle radial glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(44,36,32,0.9) 0%, #1a1614 65%)",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "140px",
              color: "#f5f0e8",
              letterSpacing: "0.08em",
              lineHeight: 1,
            }}
          >
            Rune
          </span>
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "28px",
              color: "#6b6560",
              letterSpacing: "0.14em",
              fontStyle: "italic",
            }}
          >
            Write more. Fear less.
          </span>

          {/* Gold accent line */}
          <div
            style={{
              width: "80px",
              height: "1px",
              background: "rgba(201,168,76,0.45)",
              marginTop: "8px",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
