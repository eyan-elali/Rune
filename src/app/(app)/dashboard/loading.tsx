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
    <div className="flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header skeleton */}
        <div className="mb-10 flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <Shimmer className="h-3 w-28" />
            <Shimmer className="h-9 w-56" />
          </div>
          <Shimmer className="h-8 w-28 rounded-md" />
        </div>

        {/* Stats row */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg p-5"
              style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
            >
              <Shimmer className="h-3 w-16" />
              <Shimmer className="h-8 w-20" />
            </div>
          ))}
        </div>

        {/* Recent work */}
        <div className="mb-6">
          <Shimmer className="mb-4 h-3 w-24" />
          <div
            className="rounded-lg p-6"
            style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
          >
            <Shimmer className="mb-2 h-5 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </div>
        </div>

        {/* Projects grid */}
        <div>
          <Shimmer className="mb-4 h-3 w-20" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col rounded-lg"
                style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
              >
                <Shimmer className="h-1.5 w-full rounded-t-lg rounded-b-none" />
                <div className="flex flex-col gap-3 p-5">
                  <Shimmer className="h-4 w-3/4" />
                  <Shimmer className="h-3 w-full" />
                  <Shimmer className="h-3 w-1/2" />
                  <div className="flex justify-between pt-1">
                    <Shimmer className="h-3 w-20" />
                    <Shimmer className="h-3 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
