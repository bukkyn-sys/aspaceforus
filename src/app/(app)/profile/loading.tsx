// Instant feedback while the settings server data resolves. Without this the
// route blocks on its awaits before the navigation commits, so the app appears
// to do nothing for a beat before settings fades in. Mirrors the real layout
// (back arrow + "profile." title, centred avatar, then the settings cards) so
// the swap into the live page is seamless.
export default function ProfileLoading() {
  return (
    <div className="px-4 pt-10 pb-24 max-w-lg mx-auto animate-pulse">
      {/* Header — back arrow + title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-secondary" />
        <div className="h-7 w-28 rounded-lg bg-secondary" />
      </div>

      {/* Avatar — centred circle + caption */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-full bg-secondary mb-3" />
        <div className="h-3 w-28 rounded bg-secondary/70" />
      </div>

      {/* Display name card */}
      <div className="card p-4 mb-4">
        <div className="h-3 w-24 rounded bg-secondary mb-3" />
        <div className="h-5 w-2/3 rounded bg-secondary/70" />
      </div>

      {/* Colour card — swatch row */}
      <div className="card p-4 mb-4">
        <div className="h-3 w-20 rounded bg-secondary mb-3" />
        <div className="flex justify-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-9 h-9 rounded-full bg-secondary/70" />
          ))}
        </div>
      </div>

      {/* Couple card — banner + rows */}
      <div className="card overflow-hidden mb-4">
        <div className="h-32 bg-secondary" />
        <div className="px-4 py-3.5 border-t border-border/40">
          <div className="h-4 w-1/2 rounded bg-secondary/70" />
        </div>
      </div>

      {/* Trailing setting cards */}
      <div className="card p-4 mb-4 h-16" />
      <div className="card p-4 mb-4 h-16" />
    </div>
  );
}
