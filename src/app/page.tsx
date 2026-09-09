import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-6 pb-24 pt-10 text-center sm:gap-14">
      <section className="flex max-w-2xl flex-col items-center gap-6">
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Tell us what you need.
        </h1>
        <p className="max-w-lg text-balance text-lg leading-8 text-zinc-600 dark:text-zinc-400 sm:text-xl">
          We&apos;ll find it and handle the rest — food, groceries, fashion,
          electronics, services. One request, delivered end to end.
        </p>
        <Link
          href="/requests/new"
          className="w-full max-w-xs rounded-full bg-accent px-8 py-4 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:w-auto"
        >
          Make a request
        </Link>
        <Link
          href="/suppliers/register"
          className="text-sm font-medium text-zinc-600 underline-offset-4 transition-colors hover:text-accent hover:underline dark:text-zinc-400 dark:hover:text-accent"
        >
          Are you a supplier? Sell through BUGETTA
        </Link>
      </section>

      <section
        aria-label="How it works"
        className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-4"
      >
        {[
          ["Describe", "What do you need, your budget and deadline."],
          ["Options", "We research verified choices and prices."],
          ["Approve", "You pick, then pay securely."],
          ["Delivered", "We handle fulfillment and delivery."],
        ].map(([step, detail]) => (
          <div
            key={step}
            className="flex flex-col gap-1 rounded-2xl border border-black/10 p-4 text-left dark:border-white/10"
          >
            <span className="text-sm font-semibold">{step}</span>
            <span className="text-sm leading-5 text-zinc-600 dark:text-zinc-400">
              {detail}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}