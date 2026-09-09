import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { RequestForm } from "@/components/RequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            What do you need?
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tell us the essentials — we&apos;ll turn it into a structured
            request and find verified options for you.
          </p>
        </div>

        <RequestForm />
      </div>
    </main>
  );
}