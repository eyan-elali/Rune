import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { POSITIONING, PRODUCT_NAME } from "@/lib/brand";

export const alt = `${PRODUCT_NAME} — ${POSITIONING}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The social card: the approved Sutura wordmark (light ink) on a dark field,
// with the positioning line. Rendered once at build time.
export default async function Image() {
  const wordmark = await readFile(join(process.cwd(), "public/brand/sutura/web/sutura-wordmark-light.png"));
  const src = `data:image/png;base64,${wordmark.toString("base64")}`;
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
          background: "#18191d",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "36px",
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text -- ImageResponse markup, not a page */}
          <img src={src} width={493} height={150} />
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "30px",
              color: "#a7a8ad",
              letterSpacing: "0.04em",
              fontStyle: "italic",
            }}
          >
            {POSITIONING}
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
