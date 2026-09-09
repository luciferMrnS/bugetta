import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { NotificationsList } from "@/components/NotificationsList";

export const metadata: Metadata = {
  title: "Notifications — BUGETTA",
  description: "Your request, payment and delivery updates.",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Everything from request to delivery — quotes, payments and status
            changes, in one feed.
          </p>
        </div>
        <NotificationsList />
      </div>
    </main>
  );
}