"use client";

import { useCallback, useEffect, useState } from "react";

interface Dispute {
  id: string;
  reference: string;
  requestReference: string;
  requestSummary: string;
  requestStatus: string;
  raisedByRole: string;
  reasonLabel: string;
  description: string;
  expectedResolution: string | null;
  status: string;
  statusLabel: string;
  resolutionNote: string | null;
  refundReference: string | null;
  customer?: { id: string; name: string; email: string } | null;
}

interface Complaint {
  id: string;
  reference: string;
  subjectType: string;
  subjectId: string;
  category: string;
  description: string;
  status: string;
  statusLabel: string;
  requestReference: string | null;
}

interface FraudFlag {
  id: string;
  reference: string;
  subjectType: string;
  signalLabel: string;
  severity: string;
  detail: string;
  status: string;
  statusLabel: string;
  note: string | null;
}

interface Dashboard {
  summary: {
    openDisputes: number;
    openComplaints: number;
    flaggedFraud: number;
  };
  disputes: Dispute[];
  complaints: Complaint[];
  flags: FraudFlag[];
}

const TYPE_COLORS: Record<string, string> = {
  HIGH: "bg-red-500/15 text-red-700 dark:text-red-300",
  MEDIUM: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  LOW: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
};

// Admin trust center: the full dispute/complaint/fraud queue with resolution
// actions. All resolution decisions are posted to /api/admin/trust/*.
export function AdminTrustCenter() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "error" | "ready">(
    "loading",
  );

  const reload = useCallback(() => {
    setLoadStatus("loading");
    fetch("/api/operations/trust/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (!json?.data) {
          throw new Error("Malformed dashboard response");
        }
        setData(json.data);
        setLoadStatus("ready");
      })
      .catch(() => {
        setLoadStatus("error");
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(reload, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  async function act(path: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Action failed.");
        return;
      }
      reload();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (loadStatus === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Trust center</h1>
        <p className="mt-1 animate-pulse text-sm text-zinc-600 dark:text-zinc-400">
          Loading the resolution queue…
        </p>
      </main>
    );
  }

  if (loadStatus === "error") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Trust center</h1>
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 dark:border-red-400/30 dark:bg-red-400/5">
          <p className="text-sm text-red-700 dark:text-red-300">
            We could not load the resolution queue.
          </p>
          <button
            type="button"
            onClick={reload}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  // Unreachable at runtime: "ready" is only set together with data. The
  // guard satisfies the nullability of the data state.
  if (!data) {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Trust center</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Resolve disputes, triage complaints and review fraud flags.
          </p>
        </header>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Open disputes"
            value={data.summary.openDisputes}
          />
          <SummaryCard
            label="Open complaints"
            value={data.summary.openComplaints}
          />
          <SummaryCard label="Fraud flags" value={data.summary.flaggedFraud} />
        </div>

        <section aria-label="Disputes" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Disputes</h2>
          {data.disputes.length === 0 ? (
            <EmptyState text="No disputes." />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.disputes.map((dispute) => (
                <li
                  key={dispute.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <Row
                    title={`${dispute.requestSummary} (${dispute.requestReference})`}
                    meta={`${dispute.reference} · ${dispute.statusLabel} · ${dispute.reasonLabel}`}
                    badge={dispute.status}
                  />
                  <p className="text-sm leading-6">{dispute.description}</p>
                  <p className="text-xs text-zinc-400">
                    Raised by{" "}
                    {dispute.customer?.name ??
                      `role ${dispute.raisedByRole}`}
                    {dispute.expectedResolution
                      ? ` · customer expects: ${dispute.expectedResolution}`
                      : ""}
                  </p>
                  {dispute.status === "OPEN" ||
                  dispute.status === "IN_REVIEW" ? (
                    <DisputeResolution
                      path={`/api/admin/trust/disputes/${dispute.id}`}
                      busy={busy}
                      act={act}
                    />
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {dispute.resolutionNote ?? "No resolution note."}
                      {dispute.refundReference && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {" "}
                          · {dispute.refundReference}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Complaints" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Complaints</h2>
          {data.complaints.length === 0 ? (
            <EmptyState text="No complaints." />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.complaints.map((complaint) => (
                <li
                  key={complaint.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <Row
                    title={`${complaint.category} complaint against ${complaint.subjectType}`}
                    meta={`${complaint.reference} · ${complaint.statusLabel}${
                      complaint.requestReference
                        ? ` · ${complaint.requestReference}`
                        : ""
                    }`}
                    badge={complaint.status}
                  />
                  <p className="text-sm leading-6">{complaint.description}</p>
                  {complaint.status === "OPEN" ||
                  complaint.status === "IN_REVIEW" ? (
                    <ComplaintResolution
                      path={`/api/admin/trust/complaints/${complaint.id}`}
                      busy={busy}
                      act={act}
                    />
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {complaint.status === "RESOLVED"
                        ? "Resolved"
                        : complaint.status}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Fraud flags" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Fraud flags</h2>
          {data.flags.length === 0 ? (
            <EmptyState text="No fraud flags." />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.flags.map((flag) => (
                <li
                  key={flag.id}
                  className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <Row
                    title={`${flag.signalLabel} — ${flag.subjectType}`}
                    meta={`${flag.reference} · ${flag.statusLabel}`}
                    badge={flag.severity}
                    badgeClass={TYPE_COLORS[flag.severity]}
                  />
                  <p className="text-sm leading-6">{flag.detail}</p>
                  {flag.status === "FLAGGED" &&
                    flag.severity === "HIGH" && (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        High-severity flag awaiting review.
                      </p>
                    )}
                  {flag.status === "FLAGGED" ? (
                    <FlagReview
                      path={`/api/admin/trust/flags/${flag.id}`}
                      busy={busy}
                      act={act}
                    />
                  ) : (
                    flag.note && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {flag.note}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 p-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15">
      {text}
    </p>
  );
}

function Row({
  title,
  meta,
  badge,
  badgeClass = "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
}: {
  title: string;
  meta: string;
  badge: string;
  badgeClass?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="text-xs text-zinc-400">{meta}</span>
      </div>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
        {badge}
      </span>
    </div>
  );
}

function DisputeResolution({
  path,
  busy,
  act,
}: {
  path: string;
  busy: string | null;
  act: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const disabled = busy !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-black/5 pt-3 dark:border-white/5">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Resolution note (optional)"
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => act(path, { decision: "REFUND", resolutionNote: note.trim() })}
          className="inline-flex h-9 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {busy === path ? "Processing…" : "Resolve with refund"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => act(path, { decision: "NO_REFUND", resolutionNote: note.trim() })}
          className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
        >
          {busy === path ? "Processing…" : "Resolve without refund"}
        </button>
      </div>
    </div>
  );
}

function ComplaintResolution({
  path,
  busy,
  act,
}: {
  path: string;
  busy: string | null;
  act: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [resolution, setResolution] = useState("");

  return (
    <div className="flex flex-col gap-2 border-t border-black/5 pt-3 dark:border-white/5">
      <textarea
        value={resolution}
        onChange={(event) => setResolution(event.target.value)}
        placeholder="How was this complaint resolved?"
        rows={2}
        className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
      />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy !== null || resolution.trim().length === 0}
          onClick={() => act(path, { resolution: resolution.trim() })}
          className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === path ? "Resolving…" : "Resolve complaint"}
        </button>
      </div>
    </div>
  );
}

function FlagReview({
  path,
  busy,
  act,
}: {
  path: string;
  busy: string | null;
  act: (path: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-col gap-2 border-t border-black/5 pt-3 dark:border-white/5">
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Review note (optional)"
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act(path, { status: "REVIEWED", note: note.trim() })}
          className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
        >
          {busy === path ? "Saving…" : "Mark reviewed"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act(path, { status: "CLEARED", note: note.trim() })}
          className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === path ? "Saving…" : "Clear flag"}
        </button>
      </div>
    </div>
  );
}