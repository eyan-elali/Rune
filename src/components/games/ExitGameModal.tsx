"use client";

import { Button } from "@/components/ui/Button";
import { SaveToProject } from "@/components/games/SaveToProject";
import { getLocalDateString } from "@/lib/utils";
import type { PageSource } from "@/components/games/PageSourceSelector";

interface ExitGameModalProps {
  title: string;
  words: number;
  textWritten: string;
  pageSource?: PageSource;
  onKeepGoing: () => void;
  onLeave: () => void;
}

export function ExitGameModal({
  title,
  words,
  textWritten,
  pageSource,
  onKeepGoing,
  onLeave,
}: ExitGameModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(10, 8, 6, 0.88)", backdropFilter: "blur(4px)" }}
      onClick={onKeepGoing}
    >
      <div
        className="w-full max-w-sm rounded-lg px-8 py-10 text-center"
        style={{
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border-strong)",
          boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-6 h-px w-16"
          style={{ background: "var(--color-gold)", opacity: 0.5 }}
          aria-hidden
        />

        <h2
          className="font-rune-serif text-2xl"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>

        <p className="mt-3 text-sm" style={{ color: "var(--color-mist)" }}>
          {words > 0 ? (
            <>
              You&rsquo;ve written{" "}
              <span style={{ color: "var(--color-gold)" }}>
                {words.toLocaleString()} words
              </span>{" "}
              this session. Save them before you go?
            </>
          ) : (
            "Nothing written yet — you can leave freely."
          )}
        </p>

        {words > 0 && (
          <div className="flex flex-col items-center">
            {/* No anonymous writing_sessions credit exists yet at this point in
                the game (recordWordsWritten only fires on completion) — these
                words are being transferred to the project for the first time,
                so "now" is the correct, and only sensible, credit date. */}
            <SaveToProject
              words={words}
              textWritten={textWritten}
              pageSource={pageSource}
              creditDate={getLocalDateString()}
            />
          </div>
        )}

        <div
          className="mx-auto mt-8 mb-6 h-px w-16"
          style={{ background: "var(--color-border-strong)" }}
          aria-hidden
        />

        <div className="flex justify-center gap-4">
          <Button variant="ghost" onClick={onKeepGoing}>
            Keep Writing
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Leave Arena
          </Button>
        </div>
      </div>
    </div>
  );
}
