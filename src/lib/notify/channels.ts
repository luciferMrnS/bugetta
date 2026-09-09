// Notification channel registry. Every channel is served by a deterministic
// sandbox deliverer — nothing actually leaves the server — so the full
// dispatch path (preferences → channel selection → "sent" outbox row) is
// exercised exactly as it will be with real providers. A real carrier later
// registers a deliverer behind the same contract without touching call sites.

export const NOTIFICATION_CHANNELS = [
  "email",
  "sms",
  "push",
  "whatsapp",
] as const;

export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(value: string): value is NotificationChannelKey {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

export function channelLabel(channel: string): string {
  switch (channel) {
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "push":
      return "Push";
    case "whatsapp":
      return "WhatsApp";
    default:
      return channel;
  }
}

export interface NotificationDeliveryAttempt {
  channel: NotificationChannelKey;
  provider: string;
  status: "SENT" | "FAILED";
  providerReference: string;
  sentAt: Date;
  error: string | null;
}

export interface NotificationDeliverable {
  channel: NotificationChannelKey;
  userId: string;
  title: string;
  body: string;
  reference: string | null;
  now: Date;
}

interface NotificationDeliverer {
  key: NotificationChannelKey;
  label: string;
  // Deterministic sandbox "send": records a successful dispatch and returns a
  // provider-side reference. It never opens a real socket or gateway.
  deliver(input: NotificationDeliverable): NotificationDeliveryAttempt;
}

const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function sandboxReference(channel: string, now: Date): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `SNDBX-${channel.toUpperCase()}-${now.getTime().toString(36).toUpperCase()}-${out}`;
}

function sandboxDeliverer(key: NotificationChannelKey): NotificationDeliverer {
  return {
    key,
    label: `Bugetta ${channelLabel(key)} (sandbox)`,
    deliver(input) {
      // No network call: a real provider would build and dispatch on this
      // surface. The outbox row is what makes delivery auditable.
      return {
        channel: input.channel,
        provider: `sandbox-${input.channel}`,
        status: "SENT",
        providerReference: sandboxReference(input.channel, input.now),
        sentAt: input.now,
        error: null,
      };
    },
  };
}

const deliverersByName = new Map<string, NotificationDeliverer>();
for (const channel of NOTIFICATION_CHANNELS) {
  deliverersByName.set(channel, sandboxDeliverer(channel));
}

export function getNotificationDeliverer(
  channel: string,
): NotificationDeliverer | null {
  return deliverersByName.get(channel) ?? null;
}

export function listNotificationDeliverers(): Array<{ key: string; label: string }> {
  return NOTIFICATION_CHANNELS.map((channel) => {
    const deliverer = getNotificationDeliverer(channel);
    return { key: channel, label: deliverer?.label ?? channel };
  });
}