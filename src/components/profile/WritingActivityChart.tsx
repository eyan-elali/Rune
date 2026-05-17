"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DayData {
  date: string;
  words: number;
}

interface WritingActivityChartProps {
  data: DayData[];
}

function formatXLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md px-3 py-2 text-xs"
      style={{
        background: "var(--color-sepia)",
        border: "1px solid var(--color-border-strong)",
        color: "var(--text-primary)",
      }}
    >
      <p className="mb-0.5 font-medium">{formatXLabel(label)}</p>
      <p style={{ color: "var(--color-gold)" }}>
        {(payload[0].value as number).toLocaleString()} words
      </p>
    </div>
  );
}

export function WritingActivityChart({ data }: WritingActivityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [goldColor, setGoldColor] = useState("#c9a84c");

  useEffect(() => {
    if (containerRef.current) {
      const computed = getComputedStyle(containerRef.current)
        .getPropertyValue("--color-gold")
        .trim();
      if (computed) setGoldColor(computed);
    }
  }, []);

  // Only show every 5th x-axis label
  const tickFormatter = (value: string, index: number) => {
    if (index % 5 !== 0) return "";
    return formatXLabel(value);
  };

  return (
    <div ref={containerRef} className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          barCategoryGap="20%"
        >
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11, fill: "var(--color-mist)" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-mist)" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(201,168,76,0.06)" }} />
          <Bar
            dataKey="words"
            fill={goldColor}
            radius={[2, 2, 0, 0]}
            minPointSize={data.some((d) => d.words > 0) ? 1 : 0}
            opacity={0.85}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
