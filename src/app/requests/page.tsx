import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { listRequestsForUser } from "@/lib/requests/service";
import { RequestStatusBadge } from "@/components/RequestStatusBadge";
import { formatNaira } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const requests = await listRequestsForUser(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              My requests
            </h1>
            <Link
              href="/requests/new"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              New request
            </Link>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Everything you&apos;ve asked BUGETTA to arrange.
          </p>
        </div>

        {requests.length === 0 ? (
          <section
            aria-label="No requests yet"
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 py-14 text-center dark:border-white/15"
          >
            <p className="font-medium">No requests yet</p>
            <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
              When you ask for something, it will show up here with its
              status and details.
            </p>
            <Link
              href="/requests/new"
              className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Make your first request
            </Link>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/requests/${request.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4 transition-colors hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {request.summary}
                    </span>
                    <RequestStatusBadge status={request.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{request.categoryLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{request.reference}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(request.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    {request.budgetNaira !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatNaira(request.budgetNaira * 100)}</span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}