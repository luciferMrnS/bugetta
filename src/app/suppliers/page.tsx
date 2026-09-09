import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { getSupplierProfile } from "@/lib/suppliers/service";
import { listAssignedRequests } from "@/lib/suppliers/service";
import { getSupplierEarningsSummary } from "@/lib/suppliers/service";
import { SUPPLIER_STATUS } from "@/lib/suppliers/status";
import { formatNaira } from "@/lib/money";
import { SupplierRatings } from "@/components/supplier/SupplierRatings";

export const dynamic = "force-dynamic";

export default async function SupplierDashboardPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.SUPPLIER) {
    redirect("/");
  }

  const profile = await getSupplierProfile(session.user.id);
  if (!profile) {
    redirect("/suppliers/register");
  }

  const isApproved = profile.status === SUPPLIER_STATUS.APPROVED;
  const [requests, earnings] = isApproved
    ? await Promise.all([
        listAssignedRequests(profile.id),
        getSupplierEarningsSummary(profile.id),
      ])
    : [null, null];

  // Fresh read: verification status must reflect this page load, not the
  // snapshot taken when the session was created.
  const userRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerifiedAt: true },
  });
  const emailVerified = Boolean(userRow?.emailVerifiedAt);

  const openOrders = requests?.filter((r) => r.status === "ASSIGNED" || r.status === "ACCEPTED") ?? [];
  const fulfilled = requests?.filter((r) => r.fulfilledAt !== null) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.businessName}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Your supplier dashboard · status:{" "}
              <span className="font-medium">{profile.statusLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/suppliers/offerings"
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Offerings
            </Link>
            <Link
              href="/suppliers/earnings"
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              Earnings
            </Link>
          </div>
        </div>

        {!emailVerified && (
          <div
            aria-label="Email verification"
            className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Verify your email to finish account setup</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Confirm your address to keep your account secure.
              </p>
            </div>
            <Link
              href={`/verify?email=${encodeURIComponent(session.user.email)}`}
              className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Verify email
            </Link>
          </div>
        )}

        {!isApproved && (
          <section
            aria-label="Approval status"
            className="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-5 py-4"
          >
            <p className="text-sm font-medium">Awaiting review</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Your application is in the queue. We&apos;ll get you operating as
              soon as it&apos;s approved.
            </p>
          </section>
        )}

        {isApproved && (
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/10 p-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Open orders
              </p>
              <p className="mt-1 text-2xl font-semibold">{openOrders.length}</p>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Fulfilled
              </p>
              <p className="mt-1 text-2xl font-semibold">{fulfilled.length}</p>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Total earned
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {formatNaira(earnings!.totalEarnedNaira * 100)}
              </p>
            </div>
          </div>
        )}

        {isApproved && (
          <section aria-label="Orders" className="mt-4 flex flex-col gap-3">
            <header>
              <h2 className="text-lg font-semibold">Your orders</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Requests assigned to you. Accept to begin, then mark fulfilled
                when delivered.
              </p>
            </header>
            {requests!.length === 0 ? (
              <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/15">
                No orders assigned yet. We&apos;ll match you with requests as
                they come in.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {requests!.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4 dark:border-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">{req.summary}</span>
                      <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {req.statusLabel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{req.reference}</span>
                      <span aria-hidden="true">·</span>
                      <span>{req.categoryLabel}</span>
                      {req.earnedNaira !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatNaira(req.earnedNaira * 100)}</span>
                        </>
                      )}
                      {req.fulfilledAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>fulfilled</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isApproved && <SupplierRatings />}
      </div>
    </main>
  );
}