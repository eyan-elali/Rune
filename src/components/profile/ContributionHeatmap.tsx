"use client";

import { useEffect, useState } from "react";
import { getLocalDateString } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Range = 30 | 90 | 180;
const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: 30, label: "1 Month" },
  { value: 90, label: "3 Months" },
  { value: 180, label: "6 Months" },
];

interface HeatmapCell {
  date: string;
  count: number;
  outside: boolean;
}

interface ContributionHeatmapProps {
  data: { date: string; count: number }[];
}

function getCellBackground(count: number, outside: boolean): string {
  if (outside) return "transparent";
  if (count === 0) return "var(--color-border)";
  if (count < 300) return "color-mix(in srgb, var(--color-gold) 25%, transparent)";
  if (count < 900) return "color-mix(in srgb, var(--color-gold) 55%, transparent)";
  return "var(--color-gold)";
}

export function ContributionHeatmap({ data }: ContributionHeatmapProps) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>(180);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-32 w-full rounded-lg"
        style={{ background: "rgba(201,168,76,0.06)", border: "1px solid var(--color-border)" }}
      />
    );
  }

  const countMap = new Map(data.map((d) => [d.date, d.count]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (range - 1));

  // Align grid to the Sunday on or before startDate
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const totalDays = Math.floor((today.getTime() - gridStart.getTime()) / 86400000) + 1;
  const numColumns = Math.ceil(totalDays / 7);

  const cells: HeatmapCell[] = [];
  for (let i = 0; i < numColumns * 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = getLocalDateString(d);
    const outside = d < startDate || d > today;
    cells.push({ date: dateStr, count: countMap.get(dateStr) ?? 0, outside });
  }

  const monthLabels: { label: string; column: number }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < numColumns; col++) {
    for (let row = 0; row < 7; row++) {
      const cell = cells[col * 7 + row];
      if (!cell.outside) {
        const m = new Date(cell.date + "T00:00:00").getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ label: MONTHS[m], column: col });
          lastMonth = m;
        }
        break;
      }
    }
  }

  const DAY_SIZE = 12;
  const GAP = 2;
  const CELL_STEP = DAY_SIZE + GAP;

  return (
    <div className="flex w-full flex-col items-center mx-auto">
      {/* Range toggle */}
      <div className="mb-4 flex items-center justify-center gap-1" role="group" aria-label="Activity time range">
        {RANGE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className="rounded px-3 py-1 text-xs font-medium transition-all duration-150"
            style={
              range === value
                ? {
                    background: "rgba(201,168,76,0.15)",
                    color: "var(--color-gold)",
                    borderBottom: "2px solid var(--color-gold)",
                  }
                : {
                    color: "var(--color-mist)",
                    borderBottom: "2px solid transparent",
                  }
            }
            aria-pressed={range === value}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="flex w-full items-center justify-center mx-auto"
        style={{ overflowX: "auto" }}
      >
        <div
          className="mx-auto"
          style={{ display: "inline-block", minWidth: "max-content" }}
        >
          {/* Month labels row — grid-aligned to match heatmap columns */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${numColumns}, ${DAY_SIZE}px)`,
              gap: `${GAP}px`,
              marginBottom: "4px",
            }}
            aria-hidden
          >
            {monthLabels.map(({ label, column }, idx) => {
              const nextCol =
                idx < monthLabels.length - 1
                  ? monthLabels[idx + 1].column
                  : numColumns;
              const span = Math.max(1, nextCol - column);

              return (
                <span
                  key={`${label}-${column}`}
                  style={{
                    gridColumn: `${column + 1} / span ${span}`,
                    fontSize: "10px",
                    lineHeight: "16px",
                    color: "var(--color-mist)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>

          {/* Heatmap grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${numColumns}, ${DAY_SIZE}px)`,
              gridTemplateRows: `repeat(7, ${DAY_SIZE}px)`,
              gap: `${GAP}px`,
            }}
            role="img"
            aria-label={`Writing contribution heatmap for the past ${range} days`}
          >
            {cells.map((cell, i) => {
              const col = Math.floor(i / 7) + 1;
              const row = (i % 7) + 1;
              const d = new Date(cell.date + "T00:00:00");
              const tooltipText = cell.outside
                ? undefined
                : `${d.toLocaleDateString("en-US", { month: "long", day: "numeric" })} — ${cell.count.toLocaleString()} words`;

              return (
                <div
                  key={cell.date + i}
                  title={tooltipText}
                  style={{
                    gridColumn: col,
                    gridRow: row,
                    width: `${DAY_SIZE}px`,
                    height: `${DAY_SIZE}px`,
                    borderRadius: "2px",
                    backgroundColor: getCellBackground(cell.count, cell.outside),
                  }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div
            className="mt-3 flex items-center gap-2"
            aria-hidden
            style={{ fontSize: "10px", color: "var(--color-mist)" }}
          >
            <span>Less</span>
            {[0, 150, 600, 900].map((threshold, idx) => (
              <div
                key={idx}
                style={{
                  width: `${DAY_SIZE}px`,
                  height: `${DAY_SIZE}px`,
                  borderRadius: "2px",
                  backgroundColor: getCellBackground(threshold, false),
                }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
