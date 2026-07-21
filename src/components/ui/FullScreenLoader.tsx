export default function FullScreenLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-surface-muted">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-clinical-100" />
        <div className="absolute inset-0 rounded-full border-2 border-t-clinical-600 animate-spin" />
      </div>
      <p className="text-sm text-ink-500">{label}</p>
    </div>
  );
}
