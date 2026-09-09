import { prisma } from "@/lib/prisma";
import {
  NOTIFICATION_CHANNELS,
  channelLabel,
  getNotificationDeliverer,
  type NotificationChannelKey,
} from "@/lib/notify/channels";
import {
  NOTIFICATION_TEMPLATES,
  renderTemplate,
  isNotificationKind,
  type NotificationKind,
} from "@/lib/notify/templates";
import {
  serializeNotification,
  serializeNotificationPreference,
  type NotificationChannelOnlyView,
  type NotificationView,
} from "@/lib/notify/serialize";

// Deterministic notification dispatch. Sandbox providers mean every channel
// "sends" successfully; the outbox row is the audit trail. Preferences are
// honoured: a channel with enabled=false is never dispatched. Missing
// preference rows default to enabled (sensible defaults, like the rest of app).

export interface SendNotificationInput {
  userId: string;
  kind: NotificationKind;
  reference?: string | null;
  vars?: Record<string, string>;
  now?: Date;
}

export class NotificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function getEnabledChannels(userId: string): Promise<NotificationChannelKey[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { channel: true, enabled: true },
  });
  const byChannel = new Map(rows.map((r) => [r.channel, r.enabled]));
  // Missing preference rows default to enabled (sensible defaults).
  return NOTIFICATION_CHANNELS.filter((channel) => byChannel.get(channel) ?? true);
}

export async function sendNotification(input: SendNotificationInput): Promise<NotificationView> {
  if (!isNotificationKind(input.kind)) {
    throw new NotificationError(
      "UNKNOWN_KIND",
      `Unknown notification kind: ${input.kind}`,
    );
  }
  const now = input.now ?? new Date();
  const rendered = renderTemplate(NOTIFICATION_TEMPLATES[input.kind], input.vars ?? {});

  const enabled = await getEnabledChannels(input.userId);
  const attempts: Array<{ channel: string; status: string; sentAt: string | null; error: string | null }> = [];
  let anySent = false;

  for (const channel of NOTIFICATION_CHANNELS) {
    if (!enabled.includes(channel)) {
      continue;
    }
    const deliverer = getNotificationDeliverer(channel);
    if (!deliverer) {
      attempts.push({ channel, status: "FAILED", sentAt: null, error: "No deliverer registered." });
      continue;
    }
    const attempt = deliverer.deliver({
      channel,
      userId: input.userId,
      title: rendered.title,
      body: rendered.body,
      reference: input.reference ?? null,
      now,
    });
    attempts.push({
      channel: attempt.channel,
      status: attempt.status,
      sentAt: attempt.sentAt.toISOString(),
      error: attempt.error,
    });
    if (attempt.status === "SENT") {
      anySent = true;
    }
  }

  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind as string,
      reference: input.reference ?? null,
      title: rendered.title,
      body: rendered.body,
      channels: JSON.stringify(
        attempts.filter((a) => a.status === "SENT").map((a) => a.channel),
      ),
      status: anySent ? "SENT" : "FAILED",
      error: anySent
        ? null
        : attempts.length === 0
          ? "No active notification channels."
          : "All channels failed to deliver.",
      readAt: null,
      createdAt: now,
    },
  });

  return serializeNotification(row);
}

export async function listNotificationsForUser(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" as const },
    take: opts.limit ?? 50,
  });
  return rows.map(serializeNotification);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// Marks one notification read. Returns false when the notification does not
// belong to the user (caller maps that to 404) — a no-op is safe when already
// read.
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
  return updated.count === 1;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return updated.count;
}

// ─── Preferences ────────────────────────────────────────────────────────────

export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationChannelOnlyView[]> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
  });
  const byChannel = new Map(rows.map((r) => [r.channel, r.enabled]));
  return NOTIFICATION_CHANNELS.map((channel) =>
    serializeNotificationPreference({
      channel,
      label: channelLabel(channel),
      enabled: byChannel.get(channel) ?? true,
      updatedAt: rows.find((r) => r.channel === channel)?.updatedAt ?? null,
    }),
  );
}

export async function updateNotificationPreferences(
  userId: string,
  enabledByChannel: Record<string, boolean>,
): Promise<NotificationChannelOnlyView[]> {
  const entries = Object.entries(enabledByChannel).filter(([channel]) =>
    (NOTIFICATION_CHANNELS as readonly string[]).includes(channel),
  );
  await prisma.$transaction(
    entries.map(([channel, enabled]) =>
      prisma.notificationPreference.upsert({
        where: { userId_channel: { userId, channel } },
        create: { userId, channel, enabled },
        update: { enabled },
      }),
    ),
  );
  return listNotificationPreferences(userId);
}