// Instant feedback while the settings server data resolves. Without this the
// route blocks on its awaits before the navigation commits, so the app appears
// to do nothing for a beat before settings fades in. This commits immediately.
export default function ProfileLoading() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-8 animate-pulse">
      {/* Header */}
      <div className="h-8 w-32 rounded-lg bg-secondary mb-8" />

      {/* Avatar + name block */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-secondary flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-secondary" />
          <div className="h-3 w-1/3 rounded bg-secondary/70" />
        </div>
      </div>

      {/* Setting rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl bg-secondary/70" />
        ))}
      </div>
    </div>
  );
}
