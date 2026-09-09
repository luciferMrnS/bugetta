"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import { ROLES } from "@/lib/auth/roles";

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  requestCount: number;
  sessionCount: number;
  notificationCount: number;
  supplierStatus: string | null;
}

type RoleFilter = "ALL" | (typeof ROLES)[keyof typeof ROLES];

const ROLE_FILTERS: RoleFilter[] = [
  "ALL",
  ROLES.CUSTOMER,
  ROLES.SUPPLIER,
  ROLES.OPERATIONS,
  ROLES.ADMIN,
];

const ROLE_LABELS: Record<RoleFilter, string> = {
  ALL: "All users",
  CUSTOMER: "Customers",
  SUPPLIER: "Suppliers",
  OPERATIONS: "Operations",
  ADMIN: "Admins",
};

export default function AdminUsersList() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [filter, setFilter] = useState<RoleFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ users: AdminUserRow[] }>("/api/admin/users");
        if (!cancelled) {
          setUsers(data.users);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          router.replace("/");
        } else if (err instanceof ApiError) {
          setError(err.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filtered = useMemo(
    () =>
      users?.filter((u) => filter === "ALL" || u.role === filter) ?? [],
    [users, filter],
  );

  const visible = users === null ? null : filtered;

  async function handleDelete(user: AdminUserRow) {
    const label = `${user.name} <${user.email}>`;
    if (!window.confirm(`Permanently delete ${label} and all their data?`)) {
      return;
    }
    setBusyId(user.id);
    setError(null);
    try {
      await apiFetch<{ deleted: unknown }>(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      setUsers((prev) => prev?.filter((u) => u.id !== user.id) ?? null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  }

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users ?? []) {
      counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    }
    return counts;
  }, [users]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Everyone registered on BUGETTA. Deleting a user is permanent and
          removes their requests, sessions and notifications.
        </p>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex flex-col items-start gap-3">
          <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {ROLE_FILTERS.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setFilter(role)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === role
                ? "bg-foreground text-background"
                : "border border-black/10 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            }`}
          >
            {ROLE_LABELS[role]}
            {role !== "ALL" && roleCounts.get(role) !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">
                {roleCounts.get(role)}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible === null ? (
        <p className="mt-8 animate-pulse text-sm text-zinc-500 dark:text-zinc-400">
          Loading users…
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15">
          No users in this group.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {visible.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.name}</span>
                  <RoleBadge role={user.role} />
                  {user.status === "SUSPENDED" && <StatusBadge>Suspended</StatusBadge>}
                  {user.supplierStatus === "PENDING" && (
                    <StatusBadge>Supplier pending</StatusBadge>
                  )}
                </div>
                <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {user.email}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Joined {new Date(user.createdAt).toLocaleDateString("en-GB")} ·{" "}
                  {user.requestCount} request{user.requestCount === 1 ? "" : "s"} ·{" "}
                  {user.sessionCount} session{user.sessionCount === 1 ? "" : "s"}
                </span>
              </div>
              <button
                type="button"
                disabled={busyId === user.id}
                onClick={() => handleDelete(user)}
                className="shrink-0 rounded-full border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/5 disabled:opacity-60 dark:text-red-300"
              >
                {busyId === user.id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color =
    role === ROLES.ADMIN
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : role === ROLES.OPERATIONS
        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
        : role === ROLES.SUPPLIER
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {role.toLowerCase()}
    </span>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
      {children}
    </span>
  );
}