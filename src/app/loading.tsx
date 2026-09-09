export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="h-6 w-40 animate-pulse rounded-full bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-black/5 dark:bg-white/5" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-2xl border border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.02]" />
          <div className="h-24 animate-pulse rounded-2xl border border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.02]" />
          <div className="h-24 animate-pulse rounded-2xl border border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.02]" />
        </div>
      </div>
    </main>
  );
}