import { REQUEST_STATUS } from "@/lib/requests/status";
import { requestStatusLabel } from "@/lib/requests/status";

const STATUS_TONES: Record<string, string> = {
  [REQUEST_STATUS.REQUESTED]: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  [REQUEST_STATUS.RESEARCHING]:
    "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  [REQUEST_STATUS.OPTIONS_FOUND]:
    "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  [REQUEST_STATUS.AWAITING_CUSTOMER]:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  [REQUEST_STATUS.APPROVED]: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  [REQUEST_STATUS.PAYMENT_PENDING]:
    "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  [REQUEST_STATUS.PAID]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  [REQUEST_STATUS.FULFILLMENT_PENDING]:
    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  [REQUEST_STATUS.PROCESSING]:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  [REQUEST_STATUS.OUT_FOR_DELIVERY]:
    "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  [REQUEST_STATUS.DELIVERED]:
    "bg-lime-500/15 text-lime-700 dark:text-lime-400",
  [REQUEST_STATUS.COMPLETED]:
    "bg-green-500/15 text-green-700 dark:text-green-400",
  [REQUEST_STATUS.CANCELLED]: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  [REQUEST_STATUS.REFUNDED]: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  [REQUEST_STATUS.DISPUTED]: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        STATUS_TONES[status] ?? STATUS_TONES[REQUEST_STATUS.REQUESTED]
      }`}
    >
      {requestStatusLabel(status)}
    </span>
  );
}