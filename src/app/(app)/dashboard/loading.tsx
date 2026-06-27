function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className ?? ""}`}
      style={{ background: "rgba(107, 101, 96, 0.15)" }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-10 py-12">

      {/* Welcome header */}
      <div className="mb-10">
        <Shimmer className="mb-2 h-10 w-64" />
        <Shimmer className="h-6 w-40" />
      </div>

      {/* Your Story hero */}
      <div className="mb-6">
        <Shimmer className="mb-3 h-3 w-20" />
        <div
          className="rounded-lg px-10 py-10"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border)",
            borderTopWidth: "3px",
          }}
        >
          <div className="flex items-start justify-between gap-8">
            <div className="min-w-0 flex-1">
              <Shimmer className="mb-4 h-3 w-36" />
              <Shimmer className="mb-4 h-12 w-80" />
              <Shimmer className="h-5 w-44" />
            </div>
            <Shimmer className="h-14 w-10 shrink-0 rounded" />
          </div>
          <div
            className="my-8"
            style={{ borderTop: "1px solid var(--color-border)" }}
          />
          <div className="flex items-center justify-between">
            <Shimmer className="h-4 w-36" />
            <Shimmer className="h-11 w-44 rounded-md" />
          </div>
        </div>
      </div>

      {/* Momentum strip */}
      <div className="mb-8">
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-lg sm:grid-cols-4"
          style={{
            background: "var(--color-border)",
            border: "1px solid var(--color-border)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 px-6 py-5"
              style={{ background: "var(--surface-card)" }}
            >
              <Shimmer className="h-3 w-24" />
              <Shimmer className="mt-1 h-8 w-16" />
              <Shimmer className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Explore Rune */}
      <div className="mb-10">
        <Shimmer className="mb-4 h-3 w-24" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg p-5"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--color-border)",
              }}
            >
              <Shimmer className="mb-2 h-5 w-16" />
              <Shimmer className="mb-3 h-3 w-28" />
              <Shimmer className="h-8 w-full" />
              <Shimmer className="mt-4 h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Beta note */}
      <Shimmer className="mx-auto h-3 w-56" />

    </div>
  );
}
