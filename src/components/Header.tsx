import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileMenu } from "@/components/MobileMenu";
import { NewRequestsToast } from "@/components/operations/NewRequestsToast";

export async function Header() {
  const session = await getCurrentSession();

  const isOperator =
    session !== null &&
    (session.user.role === ROLES.OPERATIONS ||
      session.user.role === ROLES.ADMIN);

  const isSupplier = session !== null && session.user.role === ROLES.SUPPLIER;

  return (
    <header className="border-b border-black/5 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight"
          aria-label="BUGETTA home"
        >
          BUGETTA
        </Link>

        <nav className="flex items-center gap-3 text-sm font-medium">
          {isOperator && (
            <Link
              href="/operations"
              className="hidden text-zinc-500 sm:inline"
            >
              Operations
            </Link>
          )}
          {session !== null && session.user.role === ROLES.ADMIN && (
            <Link
              href="/admin/suppliers"
              className="hidden text-zinc-500 sm:inline"
            >
              Supplier reviews
            </Link>
          )}
          {session !== null && session.user.role === ROLES.ADMIN && (
            <Link
              href="/admin/trust"
              className="hidden text-zinc-500 sm:inline"
            >
              Trust center
            </Link>
          )}
          {session !== null && session.user.role === ROLES.ADMIN && (
            <Link
              href="/admin/analytics"
              className="hidden text-zinc-500 sm:inline"
            >
              Analytics
            </Link>
          )}
          {session !== null && session.user.role === ROLES.ADMIN && (
            <Link
              href="/admin/users"
              className="hidden text-zinc-500 sm:inline"
            >
              Users
            </Link>
          )}
          {isSupplier && (
            <Link
              href="/suppliers"
              className="hidden text-zinc-500 sm:inline"
            >
              Supplier home
            </Link>
          )}
          {session && <NotificationBell />}
          {isOperator && <NewRequestsToast />}
          {session ? (
            <>
              <Link
                href="/requests/new"
                className="rounded-full bg-accent px-4 py-2 text-accent-foreground transition-opacity hover:opacity-90"
              >
                Make a request
              </Link>
              <Link
                href="/requests"
                className="hidden text-zinc-500 sm:inline"
              >
                My requests
              </Link>
              <span className="hidden text-zinc-400 sm:inline">·</span>
              <Link
                href="/account"
                className="hidden text-zinc-700 transition-colors hover:bg-black/5 sm:inline dark:text-zinc-200 dark:hover:bg-white/5"
              >
                {session.user.name.split(" ")[0]}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-4 py-2 text-zinc-700 transition-colors hover:bg-black/5 sm:inline dark:text-zinc-200 dark:hover:bg-white/5"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="hidden rounded-full bg-accent px-4 py-2 text-accent-foreground transition-opacity hover:opacity-90 sm:inline"
              >
                Create account
              </Link>
            </>
          )}

          <MobileMenu sessionRole={session?.user.role ?? null} />
        </nav>
      </div>
    </header>
  );
}