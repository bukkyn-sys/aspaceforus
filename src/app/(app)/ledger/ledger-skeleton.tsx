// Shown while the ledger's first load resolves (no cache yet). Mirrors the
// header, tab toggle, balance card, and a few entry rows so the swap into live
// data is seamless. Pure presentational; no data, no hooks.
export default function LedgerSkeleton() {
  return (
    <div className="px-4 pb-6 max-w-lg mx-auto animate-pulse">
      {/* Header */}
      <div className="pt-10 pb-3 mb-4">
        <div className="h-8 w-32 rounded-lg bg-secondary" />
        <div className="h-3 w-44 rounded bg-secondary/60 mt-2" />
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 mb-4">
        <div className="h-9 flex-1 rounded-xl bg-secondary" />
        <div className="h-9 flex-1 rounded-xl bg-secondary/50" />
      </div>

      {/* Balance card */}
      <div className="card p-4 mb-4">
        <div className="h-3 w-20 rounded bg-secondary mb-3" />
        <div className="h-8 w-2/5 rounded-lg bg-secondary/70" />
      </div>

      {/* Entry rows */}
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-secondary" />
              <div className="h-3 w-20 rounded bg-secondary/60" />
            </div>
            <div className="h-5 w-16 rounded bg-secondary/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
