export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Skeleton matching StatCard's shape — used while dashboard stats load. */
export function SkeletonStatCard() {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-7 w-16" />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton matching a data table's shape — used while table rows load. */
export function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b border-surface-line px-5 py-3">
        <SkeletonBlock className="h-3 w-32" />
      </div>
      <div className="divide-y divide-surface-line">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: columns }).map((__, c) => (
              <SkeletonBlock key={c} className={`h-4 ${c === 0 ? 'w-32' : 'w-20'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for a generic card of chart/content. */
export function SkeletonCard({ className = 'h-64' }: { className?: string }) {
  return (
    <div className="surface-card p-6">
      <SkeletonBlock className="mb-4 h-4 w-40" />
      <SkeletonBlock className={className} />
    </div>
  );
}
