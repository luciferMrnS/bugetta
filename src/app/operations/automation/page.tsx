import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { AutomationLedger } from "@/components/operations/AutomationLedger";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.OPERATIONS && session.user.role !== ROLES.ADMIN) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Automation ledger
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every automated run — customer acknowledgements, supplier leads,
          auto-quotes, payment and delivery notifications, low-stock alerts —
          with its status and recorded failure, so automation stays auditable.
        </p>
        <Link
          href="/operations"
          className="mt-1 self-start text-sm text-zinc-500 underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Back to the operations dashboard
        </Link>
      </div>

      <div className="mt-8">
        <AutomationLedger />
      </div>
    </main>
  );
}