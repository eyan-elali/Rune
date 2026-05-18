"use client";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface HeatmapCell {
  date: string;
  count: number;
  outside: boolean; // before the 365-day window or after today
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
  const countMap = new Map(data.map((d) => [d.date, d.count]));

  // Range: 365 days ending today (inclusive)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);

  // Align grid to the Sunday on or before startDate
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  // Total columns (weeks) needed to cover gridStart → today
  const totalDays = Math.floor((today.getTime() - gridStart.getTime()) / 86400000) + 1;
  const numColumns = Math.ceil(totalDays / 7);

  // Build cells in column-major order (col 0..N, row 0..6 within each col)
  const cells: HeatmapCell[] = [];
  for (let i = 0; i < numColumns * 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const outside = d < startDate || d > today;
    cells.push({ date: dateStr, count: countMap.get(dateStr) ?? 0, outside });
  }

  // Month labels: first non-outside cell in each column where the month changes
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
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "inline-block", minWidth: "max-content" }}>
        {/* Month labels row */}
        <div
          style={{
            position: "relative",
            height: "16px",
            marginBottom: "4px",
            width: `${numColumns * CELL_STEP - GAP}px`,
          }}
          aria-hidden
        >
          {monthLabels.map(({ label, column }) => (
            <span
              key={`${label}-${column}`}
              style={{
                position: "absolute",
                left: `${column * CELL_STEP}px`,
                fontSize: "10px",
                color: "var(--color-mist)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          ))}
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
          aria-label="Writing contribution heatmap for the past year"
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
  );
}
