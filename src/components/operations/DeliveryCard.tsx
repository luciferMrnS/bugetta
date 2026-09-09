"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import { formatNaira } from "@/lib/money";
import {
  DELIVERY_LIFECYCLE,
  deliveryStatusLabel,
} from "@/lib/delivery/status";

interface FeeLine {
  label: string;
  amountNaira: number;
}

interface DeliveryEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  toStatusLabel: string;
  cause: string;
  actorRole: string | null;
  details: string | null;
  createdAt: string;
}

interface DeliveryView {
  id: string;
  reference: string;
  provider: string;
  providerLabel: string;
  status: string;
  statusLabel: string;
  pickup: string | null;
  dropLocation: string | null;
  feeNaira: number;
  feeBreakdown: FeeLine[];
  eta: string | null;
  trackingUrl: string | null;
  trackingReference: string | null;
  proofType: string | null;
  proofReference: string | null;
  proofNote: string | null;
  recipientName: string | null;
  deliveredAt: string | null;
  notes: string | null;
  allowedTransitions: string[];
  events: DeliveryEvent[];
  createdAt: string;
  updatedAt: string;
}

interface ProviderDescriptor {
  key: string;
  label: string;
  description: string;
  supportsTracking: boolean;
}

const inputClass =
  "w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/15 dark:border-white/15";

export function DeliveryCard({
  requestId,
  defaultLocation,
}: {
  requestId: string;
  defaultLocation: string | null;
}) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<DeliveryView | null | undefined>(
    undefined,
  );
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [provider, setProvider] = useState("sandbox");
  const [priority, setPriority] = useState("STANDARD");
  const [dropLocation, setDropLocation] = useState(defaultLocation ?? "");
  const [pickup, setPickup] = useState("");
  const [notes, setNotes] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [nextStatus, setNextStatus] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [proofType, setProofType] = useState("confirmation_code");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ delivery: DeliveryView }>(
      `/api/operations/requests/${requestId}/delivery`,
    )
      .then((data) => {
        if (!cancelled) {
          setDelivery(data.delivery);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setDelivery(null);
        } else {
          setDelivery(null);
          setError("Could not load delivery details.");
        }
      });
    apiFetch<{ providers: ProviderDescriptor[] }>(
      "/api/operations/delivery/providers",
    )
      .then((data) => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch(() => {
        // Provider list is cosmetic; assignment still works with the default.
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function createDelivery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ delivery: DeliveryView }>(
        `/api/operations/requests/${requestId}/delivery`,
        {
          method: "POST",
          body: {
            provider,
            priority,
            dropLocation: dropLocation.trim() || undefined,
            pickup: pickup.trim() || undefined,
            notes: notes.trim() || undefined,
          },
        },
      );
      setDelivery(data.delivery);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not assign the delivery.",
      );
      setPending(false);
    }
  }

  async function advanceStatus(
    next: string,
    eventPayload?: Record<string, string | undefined>,
  ) {
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<{ delivery: DeliveryView }>(
        `/api/operations/requests/${requestId}/delivery/status`,
        {
          method: "POST",
          body: { status: next, ...eventPayload },
        },
      );
      setNextStatus("");
      setProofReference("");
      setProofNote("");
      setRecipientName("");
      setNewNotes("");
      setDelivery(data.delivery);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update delivery.");
      setPending(false);
    }
  }

  function submitStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextStatus) {
      return;
    }
    const isDelivered = nextStatus === "DELIVERED";
    void advanceStatus(
      nextStatus,
      isDelivered
        ? {
            recipientName: recipientName.trim() || undefined,
            proofType,
            proofReference: proofReference.trim() || undefined,
            proofNote: proofNote.trim() || undefined,
          }
        : { notes: newNotes.trim() || undefined },
    );
  }

  if (delivery === undefined) {
    return (
      <section
        aria-label="Delivery"
        className="flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </section>
    );
  }

  if (delivery === null) {
    return (
      <section
        aria-label="Delivery"
        className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No delivery assigned yet. Assign a courier once the request is paid.
        </p>
        <form onSubmit={createDelivery} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={inputClass}
              >
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                <option value="STANDARD">Standard</option>
                <option value="EXPRESS">Express</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Drop location
            <input
              value={dropLocation}
              onChange={(e) => setDropLocation(e.target.value)}
              placeholder="Defaults to the request location"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Pickup
            <input
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Where the parcel is collected (optional)"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Assigning…" : "Assign delivery"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  const lifecyclePosition = DELIVERY_LIFECYCLE.indexOf(
    delivery.status as (typeof DELIVERY_LIFECYCLE)[number],
  );
  const progress =
    lifecyclePosition === -1
      ? 0
      : Math.max(0, Math.min(100, (lifecyclePosition / (DELIVERY_LIFECYCLE.length - 1)) * 100));

  return (
    <section
      aria-label="Delivery"
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold">
            {delivery.statusLabel}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {delivery.reference}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {DELIVERY_LIFECYCLE.map((step) => (
          <span
            key={step}
            className={
              DELIVERY_LIFECYCLE.indexOf(step) <= lifecyclePosition
                ? "font-semibold text-emerald-600 dark:text-emerald-400"
                : ""
            }
          >
            {deliveryStatusLabel(step)}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Provider</dt>
          <dd className="font-medium">{delivery.providerLabel}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">ETA</dt>
          <dd className="font-medium">
            {delivery.eta
              ? new Date(delivery.eta).toLocaleString("en-NG", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Not set"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Drop</dt>
          <dd className="font-medium">{delivery.dropLocation ?? "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Pickup</dt>
          <dd className="font-medium">{delivery.pickup ?? "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Courier reference</dt>
          <dd className="font-medium">{delivery.trackingReference}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Delivery fee</dt>
          <dd className="font-bold">{formatNaira(delivery.feeNaira * 100)}</dd>
        </div>
      </dl>

      {delivery.feeBreakdown.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-black/5 pt-2 text-xs dark:border-white/5">
          {delivery.feeBreakdown.map((line) => (
            <li
              key={line.label}
              className="flex items-center justify-between text-zinc-500 dark:text-zinc-400"
            >
              <span>{line.label}</span>
              <span>{formatNaira(line.amountNaira * 100)}</span>
            </li>
          ))}
        </ul>
      )}

      {delivery.notes && (
        <p className="whitespace-pre-wrap rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-white/5 dark:bg-white/[0.03] dark:text-zinc-300">
          {delivery.notes}
        </p>
      )}

      {delivery.status === "DELIVERED" && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 dark:border-emerald-400/30 dark:bg-emerald-400/5">
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Proof of delivery
          </span>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Recipient</dt>
              <dd className="font-medium">{delivery.recipientName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Delivered at</dt>
              <dd className="font-medium">
                {delivery.deliveredAt
                  ? new Date(delivery.deliveredAt).toLocaleString("en-NG")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Proof</dt>
              <dd className="font-medium">
                {delivery.proofReference
                  ? `${delivery.proofType ?? "confirmation"} · ${delivery.proofReference}`
                  : "No proof reference captured"}
              </dd>
            </div>
            {delivery.proofNote && (
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Note</dt>
                <dd className="font-medium">{delivery.proofNote}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {delivery.allowedTransitions.length > 0 && (
        <form
          onSubmit={submitStatus}
          className="flex flex-col gap-3 border-t border-black/5 pt-3 dark:border-white/5"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Move to
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                {delivery.allowedTransitions.map((status) => (
                  <option key={status} value={status}>
                    {deliveryStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            {nextStatus === "DELIVERED" && (
              <label className="flex flex-col gap-1 text-sm">
                Recipient name
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            {nextStatus === "DELIVERED" && (
              <label className="flex flex-col gap-1 text-sm">
                Proof type
                <select
                  value={proofType}
                  onChange={(e) => setProofType(e.target.value)}
                  className={inputClass}
                >
                  <option value="confirmation_code">Confirmation code</option>
                  <option value="signature">Signature</option>
                  <option value="photo">Photo</option>
                </select>
              </label>
            )}
            {nextStatus === "DELIVERED" && (
              <label className="flex flex-col gap-1 text-sm">
                Proof reference
                <input
                  value={proofReference}
                  onChange={(e) => setProofReference(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            {nextStatus === "DELIVERED" && (
              <label className="flex flex-col gap-1 text-sm">
                Proof note
                <input
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
            {nextStatus && nextStatus !== "DELIVERED" && (
              <label className="flex flex-col gap-1 text-sm">
                Note
                <input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className={inputClass}
                />
              </label>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || !nextStatus}
              className="ml-auto rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Updating…" : "Update delivery"}
            </button>
          </div>
        </form>
      )}

      {delivery.events.length > 0 && (
        <ol className="flex flex-col divide-y divide-black/5 border-t border-black/5 pt-2 dark:divide-white/5 dark:border-white/5">
          {delivery.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                {event.fromStatus && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {deliveryStatusLabel(event.fromStatus)}
                  </span>
                )}
                {event.fromStatus && <span aria-hidden="true">→</span>}
                <span className="font-medium">{event.toStatusLabel}</span>
              </div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {event.details ?? ""}
                {event.actorRole ? ` · ${event.actorRole}` : ""} ·{" "}
                {new Date(event.createdAt).toLocaleString("en-NG", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}