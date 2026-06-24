// Shown while the dashboard's first load resolves (no cache yet). Mirrors the
// real layout — banner, header row, then the stacked cards — so the swap into
// live data is seamless. Pure presentational; no data, no hooks.
export default function DashboardSkeleton() {
  return (
    <div className="pb-6 max-w-lg mx-auto animate-pulse">
      {/* Banner */}
      <div className="h-40 bg-secondary" />

      <div className="px-4 pt-4">
        {/* Header — greeting + name on the left, gear + avatar on the right */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-secondary/70" />
            <div className="h-8 w-40 rounded-lg bg-secondary" />
            <div className="h-3 w-28 rounded bg-secondary/60" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-secondary" />
            <div className="w-9 h-9 rounded-full bg-secondary" />
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {/* Mood card */}
          <div className="col-span-2 card p-4">
            <div className="h-3 w-28 rounded bg-secondary mb-4" />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-secondary" />
              <div className="h-9 flex-1 rounded-2xl bg-secondary/50" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary" />
              <div className="h-9 flex-1 rounded-2xl bg-secondary/50" />
            </div>
          </div>

          {/* Daily card */}
          <div className="col-span-2 card p-4">
            <div className="h-3 w-20 rounded bg-secondary mb-3" />
            <div className="h-5 w-3/4 rounded bg-secondary/70 mb-4" />
            <div className="h-11 w-full rounded-xl bg-secondary/50" />
          </div>

          {/* Two stacked content cards (countdowns / pots / etc.) */}
          <div className="col-span-2 card p-4">
            <div className="h-3 w-24 rounded bg-secondary mb-3" />
            <div className="h-16 w-full rounded-xl bg-secondary/40" />
          </div>
          <div className="col-span-2 card p-4">
            <div className="h-3 w-20 rounded bg-secondary mb-3" />
            <div className="h-16 w-full rounded-xl bg-secondary/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
