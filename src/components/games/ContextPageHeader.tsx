"use client";

import { useLayoutEffect, useRef } from "react";
import type { TNode } from "@/lib/export/tiptapToPdf";
import { tiptapToPlainLines } from "@/lib/export/tiptapToPdf";

type ContextPageHeaderProps = {
  content: Record<string, unknown> | null;
};

export function ContextPageHeader({ content }: ContextPageHeaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = content ? tiptapToPlainLines(content as TNode) : [];

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, lines.length]);

  if (!content || lines.length === 0) return null;

  return (
    <div className="px-8 pb-0 pt-8">
      <div style={{ position: "relative" }}>
        <div
          ref={scrollRef}
          style={{
            maxHeight: "200px",
            overflowY: "auto",
            opacity: 0.25,
            pointerEvents: "none",
            userSelect: "none",
            scrollbarWidth: "none",
          }}
          aria-hidden="true"
        >
          <div
            className="font-rune-serif text-base leading-[1.9]"
            style={{ color: "var(--text-primary)" }}
          >
            {lines.map((line, i) =>
              line === "—" ? (
                <hr
                  key={i}
                  style={{ borderColor: "var(--color-border)", margin: "0.5em 0" }}
                />
              ) : (
                <p key={i} className="mb-[0.4em]">{line}</p>
              )
            )}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "64px",
            background: "linear-gradient(to bottom, transparent, var(--color-vellum))",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      </div>

      <div className="mb-6 mt-3">
        <div style={{ height: "1px", background: "rgba(201, 168, 76, 0.3)" }} />
        <p
          className="mt-2 text-center font-rune-serif text-[10px] italic"
          style={{ color: "var(--color-mist)", opacity: 0.5, letterSpacing: "0.12em" }}
        >
          — prior text —
        </p>
      </div>
    </div>
  );
}
