import type { NotificationChannelKey } from "@/lib/notify/channels";
import type { NotificationKind } from "@/lib/notify/templates";

// Wire shape for a notification delivered to a user. `channels` lists every
// channel the event was dispatched on (after preference filtering), newest
// first for the bell.
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  reference: string | null;
  title: string;
  body: string;
  channels: NotificationChannelKey[];
  status: string;
  error: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationChannelOnlyView {
  channel: NotificationChannelKey;
  label: string;
  enabled: boolean;
  updatedAt: string | null;
}

type NotificationRow = {
  id: string;
  kind: string;
  reference: string | null;
  title: string;
  body: string;
  channels: string;
  status: string;
  error: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function parseChannels(encoded: string): NotificationChannelKey[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed) ? (parsed as NotificationChannelKey[]) : [];
  } catch {
    return [];
  }
}

export function serializeNotification(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    kind: row.kind as NotificationKind,
    reference: row.reference,
    title: row.title,
    body: row.body,
    channels: parseChannels(row.channels),
    status: row.status,
    error: row.error,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeNotificationPreference(
  row: {
    channel: NotificationChannelKey;
    label: string;
    enabled: boolean;
    updatedAt: Date | string | null;
  },
): NotificationChannelOnlyView {
  return {
    channel: row.channel,
    label: row.label,
    enabled: row.enabled,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt,
  };
}