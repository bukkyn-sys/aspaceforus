// Shown while the vault's folder list first loads. Mirrors the title row + the
// stacked folder rows so the swap into live data is seamless. Pure presentational.
export default function VaultListsSkeleton() {
  return (
    <div className="max-w-lg mx-auto animate-pulse">
      <div className="px-4 pt-3 pb-5">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div className="h-7 w-24 rounded-lg bg-secondary" />
          <div className="w-8 h-8 rounded-xl bg-secondary" />
        </div>

        {/* Folder rows */}
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-secondary/50 h-[66px] flex items-center gap-3 px-4">
              <div className="w-9 h-9 rounded-xl bg-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-secondary" />
                <div className="h-3 w-16 rounded bg-secondary/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
