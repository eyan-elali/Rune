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
        <Shimmer className="mb-2 h-10 w-72" />
        <Shimmer className="h-5 w-36" />
      </div>

      {/* Continue Writing hero */}
      <div className="mb-10">
        <Shimmer className="mb-3 h-3 w-28" />
        <div
          className="rounded-lg p-8"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border)",
            borderTopWidth: "3px",
          }}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex-1">
              <Shimmer className="mb-3 h-3 w-32" />
              <Shimmer className="mb-2 h-9 w-72" />
              <Shimmer className="h-5 w-48" />
            </div>
            <Shimmer className="h-7 w-5 rounded" />
          </div>
          <div
            className="mb-6"
            style={{ borderTop: "1px solid var(--color-border)" }}
          />
          <div className="flex items-center justify-between">
            <Shimmer className="h-4 w-20" />
            <Shimmer className="h-10 w-40 rounded-md" />
          </div>
        </div>
      </div>

      {/* Task list card */}
      <div
        className="mb-10 rounded-lg p-5"
        style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <Shimmer className="h-3 w-12" />
          <Shimmer className="h-6 w-32 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Shimmer className="h-9 w-full rounded" />
          <Shimmer className="h-9 w-full rounded" />
        </div>
      </div>

      {/* Writing Goals section */}
      <div className="mb-10">
        <Shimmer className="mb-4 h-3 w-24" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg p-5"
              style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
            >
              <Shimmer className="mb-3 h-3 w-24" />
              <Shimmer className="h-10 w-16" />
              <Shimmer className="mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg p-5"
            style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
          >
            <Shimmer className="h-8 w-8 rounded" />
            <div>
              <Shimmer className="mb-1 h-5 w-16" />
              <Shimmer className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Work section */}
      <div className="mb-10">
        <Shimmer className="mb-3 h-3 w-24" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg p-5"
              style={{ background: "var(--surface-card)", border: "1px solid var(--color-border)" }}
            >
              <Shimmer className="mb-2 h-3 w-20" />
              <Shimmer className="mb-1 h-5 w-3/4" />
              <Shimmer className="h-3 w-1/2" />
              <Shimmer className="mt-auto pt-3 h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Beta feedback banner */}
      <div
        className="w-full rounded-lg px-6 py-5"
        style={{ background: "var(--surface-card)", border: "1px solid rgba(201, 168, 76, 0.10)" }}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
          <Shimmer className="h-3 w-28 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-4/5" />
          </div>
        </div>
      </div>

    </div>
  );
}
