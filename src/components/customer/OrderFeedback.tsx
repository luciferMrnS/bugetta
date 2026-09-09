"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Rating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RatableSupplier {
  id: string;
  businessName: string;
  rating: Rating | null;
}

interface Dispute {
  reference: string;
  status: string;
  statusLabel: string;
  reason: string;
  reasonLabel: string;
  description: string;
  expectedResolution: string | null;
  resolutionNote: string | null;
  refundReference: string | null;
  createdAt: string;
}

// Customer feedback block on the request page: rate the supplier(s) who served
// the order, open a dispute, or report a problem. Eligibility is decided by the
// server (lib/trust/ratings.ts); this component only renders what the API says.
export function OrderFeedback({ requestId }: { requestId: string }) {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<RatableSupplier[] | null>(null);
  const [eligible, setEligible] = useState(false);
  const [dispute, setDispute] = useState<Dispute | null | undefined>(undefined);

  const reload = useCallback(() => {
    fetch(`/api/requests/${requestId}/ratings`)
      .then((res) => res.json())
      .then((data) => {
        setEligible(!!data.eligible);
        setSuppliers(data.suppliers ?? []);
      })
      .catch(() => {
        setSuppliers([]);
      });
    fetch(`/api/requests/${requestId}/dispute`)
      .then((res) => res.json())
      .then((data) => setDispute(data.dispute ?? null))
      .catch(() => setDispute(null));
  }, [requestId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (suppliers === null) {
    return null;
  }
  if (!eligible && dispute === undefined) {
    return null;
  }
  if (!eligible && dispute === null) {
    return null;
  }

  return (
    <section
      aria-label="Feedback and disputes"
      className="flex flex-col gap-6 rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          Rate your order
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Your feedback builds a supplier&apos;s reliability score and helps the
          marketplace.
        </p>
      </header>

      {eligible &&
        suppliers.map((supplier) => (
          <RatingForm
            key={supplier.id}
            requestId={requestId}
            supplier={supplier}
            onSaved={() => router.refresh()}
          />
        ))}

      {!eligible && <p className="text-sm text-zinc-500">Ratings open once fulfilment starts.</p>}

      {dispute !== undefined && (
        <div className="border-t border-black/5 pt-6 dark:border-white/5">
          {dispute === null ? (
            <RaiseDisputeForm requestId={requestId} onOpened={() => reload()} />
          ) : (
            <DisputeCard dispute={dispute} />
          )}
        </div>
      )}

      <div className="border-t border-black/5 pt-6 dark:border-white/5">
        <ComplaintForm requestId={requestId} suppliers={suppliers} />
      </div>
    </section>
  );
}

function RatingForm({
  requestId,
  supplier,
  onSaved,
}: {
  requestId: string;
  supplier: RatableSupplier;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<number>(supplier.rating?.score ?? 0);
  const [comment, setComment] = useState(supplier.rating?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (score < 1) {
      setError("Pick a star rating from 1 to 5.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          score,
          comment: comment.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || "Something went wrong.");
        return;
      }
      onSaved();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{supplier.businessName}</p>
        <div className="flex items-center gap-0.5" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={busy}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
              onClick={() => setScore(star)}
              className={`text-xl leading-none transition-opacity disabled:opacity-50 ${
                star <= score
                  ? "text-amber-500"
                  : "text-zinc-300 hover:text-amber-300 dark:text-zinc-600"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="What went well, or what could be better? (optional)"
        rows={2}
        className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : supplier.rating ? "Update rating" : "Submit rating"}
        </button>
      </div>
    </div>
  );
}

function RaiseDisputeForm({
  requestId,
  onOpened,
}: {
  requestId: string;
  onOpened: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [expectedResolution, setExpectedResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || description.trim().length < 10) {
      setError("Choose a reason and describe the issue in a little more detail.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/disputes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          description: description.trim(),
          expectedResolution: expectedResolution.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || "Something went wrong.");
        return;
      }
      setOpen(false);
      onOpened();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Dispute</h3>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
          >
            Raise a dispute
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-3 rounded-xl border border-black/5 p-4 dark:border-white/5">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
          >
            <option value="">Why are you disputing?</option>
            <option value="NOT_RECEIVED">Order not received</option>
            <option value="WHY_WRONG">Wrong item / order</option>
            <option value="QUALITY">Quality issue</option>
            <option value="BILLING">Billing / charge issue</option>
            <option value="OTHER">Something else</option>
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us what happened."
            rows={3}
            className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
          />
          <input
            value={expectedResolution}
            onChange={(event) => setExpectedResolution(event.target.value)}
            placeholder="What would fix this? e.g. a full refund, a replacement… (optional)"
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="inline-flex h-9 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Opening…" : "Open dispute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DisputeCard({ dispute }: { dispute: Dispute }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Dispute</h3>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {dispute.statusLabel}
        </span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {dispute.reference} · {dispute.reasonLabel}
      </p>
      {dispute.resolutionNote && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {dispute.resolutionNote}
        </p>
      )}
      {dispute.refundReference && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Refunded · {dispute.refundReference}
        </p>
      )}
    </div>
  );
}

function ComplaintForm({
  requestId,
  suppliers,
}: {
  requestId: string;
  suppliers: RatableSupplier[];
}) {
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!subjectId || !category || description.trim().length < 10) {
      setError("Fill in the supplier, category and description to file a report.");
      return;
    }
    setError(null);
    setConfirmation(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "SUPPLIER",
          subjectId,
          category,
          description: description.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || "Something went wrong.");
        return;
      }
      setOpen(false);
      setConfirmation(body?.complaint?.reference ?? "Report filed.");
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (suppliers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Report a problem</h3>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
          >
            File a report
          </button>
        )}
      </div>

      {confirmation && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {confirmation} filed. Our team will review it.
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-3 rounded-xl border border-black/5 p-4 dark:border-white/5">
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
          >
            <option value="">Which supplier?</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.businessName}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none dark:border-white/15"
          >
            <option value="">What kind of problem?</option>
            <option value="LATE_DELIVERY">Late delivery</option>
            <option value="QUALITY">Quality</option>
            <option value="COMMUNICATION">Communication</option>
            <option value="BILLING">Billing</option>
            <option value="CONDUCT">Conduct</option>
            <option value="OTHER">Other</option>
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe what happened."
            rows={3}
            className="w-full resize-none rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/15"
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="inline-flex h-9 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Filing…" : "File report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}