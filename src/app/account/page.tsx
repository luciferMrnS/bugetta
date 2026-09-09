import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/LogoutButton";
import { TransactionHistory } from "@/components/account/TransactionHistory";
import { NotificationPreferences } from "@/components/account/NotificationPreferences";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const { user } = session;
  const joined = new Date(user.createdAt).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Fresh read: the verification status must reflect the moment this page
  // loads, not the snapshot taken when the session was created.
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });
  const emailVerified = Boolean(profile?.emailVerifiedAt);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <div className="flex flex-col gap-8">
        {!emailVerified && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Verify your email to finish account setup</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Confirm your address to keep your account secure.
              </p>
            </div>
            <Link
              href={`/verify?email=${encodeURIComponent(user.email)}`}
              className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Verify email
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hello, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your account and request history live here.
          </p>
        </div>

        <section
          aria-label="Profile"
          className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
        >
          {[
            ["Name", user.name],
            ["Email", user.email],
            ["Phone", user.phone ?? "Not provided"],
            ["Role", user.role.toLowerCase()],
            ["Member since", joined],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 border-b border-black/5 pb-3 last:border-0 last:pb-0 dark:border-white/5"
            >
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                {label}
              </dt>
              <dd className="text-right text-sm font-medium">{value}</dd>
            </div>
          ))}
        </section>

        <TransactionHistory />

        <NotificationPreferences />

        <div className="flex">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}