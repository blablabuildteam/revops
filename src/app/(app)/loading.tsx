export default function AppLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-neutral-900 rounded animate-pulse" />
        <div className="h-4 w-72 bg-neutral-900 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-20 border border-neutral-800 rounded-lg bg-neutral-900/40 animate-pulse"
          />
        ))}
      </div>
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-14 border-b border-neutral-800 bg-neutral-900/40 animate-pulse last:border-b-0"
          />
        ))}
      </div>
    </div>
  );
}
