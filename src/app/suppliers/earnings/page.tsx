import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import {
  getSupplierProfile,
  listSupplierEarnings,
  getSupplierEarningsSummary,
} from "@/lib/suppliers/service";
import { SUPPLIER_STATUS } from "@/lib/suppliers/status";
import { formatNaira } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SupplierEarningsPage() {
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

  if (profile.status !== SUPPLIER_STATUS.APPROVED) {
    redirect("/suppliers");
  }

  const [earnings, summary] = await Promise.all([
    listSupplierEarnings(profile.id),
    getSupplierEarningsSummary(profile.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              What you&apos;ve earned from fulfilled orders.
            </p>
          </div>
          <Link
            href="/suppliers"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/10 p-5">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Total earned
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {formatNaira(summary.totalEarnedNaira * 100)}
            </p>
          </div>
          <div className="rounded-2xl border border-black/10 p-5">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Paid out
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {formatNaira(summary.totalPaidNaira * 100)}
            </p>
          </div>
        </div>

        {profile.paymentDetails && (
          <section
            aria-label="Settlement details"
            className="rounded-2xl border border-black/10 bg-black/[0.02] p-5 text-sm dark:border-white/10 dark:bg-white/[0.02]"
          >
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Settlement details
            </p>
            <p className="mt-1 whitespace-pre-line">{profile.paymentDetails}</p>
          </section>
        )}

        {earnings.length === 0 ? (
          <section
            aria-label="No earnings yet"
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/15"
          >
            <p className="font-medium">No earnings yet</p>
            <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
              Earnings appear here when you mark an accepted order as
              fulfilled.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {earnings.map((earning) => (
              <li
                key={earning.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{earning.summary}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {earning.reference} · {earning.reason.toLowerCase()}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatNaira(earning.amountNaira * 100)}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {earning.status === "PAID" ? "Paid" : "Earned"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}