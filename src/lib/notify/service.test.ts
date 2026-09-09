import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { resetDatabase } from "@/lib/test/http";
import {
  sendNotification,
  listNotificationsForUser,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  listNotificationPreferences,
  updateNotificationPreferences,
  NotificationError,
} from "@/lib/notify/service";
import { NOTIFICATION_CHANNELS } from "@/lib/notify/channels";
import {
  renderTemplate,
  NOTIFICATION_TEMPLATES,
  isNotificationKind,
} from "@/lib/notify/templates";

function makeUser(email: string): Promise<string> {
  return prisma.user.create({
    data: {
      email,
      passwordHash: hashPasswordHack(),
      name: "Ngozi Bell",
      role: ROLES.CUSTOMER,
    },
  }).then((u) => u.id);
}

function hashPasswordHack(): string {
  return "unit-test-hash";
}

beforeEach(async () => {
  await resetDatabase();
});

describe("notification service", () => {
  it("renders templates with variables filled and unknown vars replaced", () => {
    const rendered = renderTemplate(NOTIFICATION_TEMPLATES.REQUEST_CREATED, {
      ref: "REQ-XYZ",
      summary: "Catering for 40 guests",
    });
    expect(rendered.title).toBe("We received your request REQ-XYZ");
    expect(rendered.body).toContain("Catering for 40 guests");
    expect(rendered.body).not.toContain("{");
  });

  it("supports all kinds the automation layer can dispatch", () => {
    for (const kind of ["REQUEST_CREATED", "NEW_REQUEST", "SUPPLIER_LEAD", "QUOTE_READY", "PAYMENT_PAID", "ORDER_PROCESSING", "DELIVERED", "LOW_STOCK"]) {
      expect(isNotificationKind(kind)).toBe(true);
    }
    expect(isNotificationKind("NOT_A_KIND")).toBe(false);
  });

  it("rejects unknown kinds and sends on every enabled channel by default", async () => {
    const userId = await makeUser("bell@example.com");

    await expect(
      sendNotification({ userId, kind: "NOT_A_KIND" as never }),
    ).rejects.toBeInstanceOf(NotificationError);

    const created = await sendNotification({
      userId,
      kind: "REQUEST_CREATED",
      reference: "REQ-1",
      vars: { ref: "REQ-1", summary: "Catering" },
    });
    expect(created.kind).toBe("REQUEST_CREATED");
    expect(created.status).toBe("SENT");
    expect(created.channels).toEqual(NOTIFICATION_CHANNELS);
    expect(created.readAt).toBeNull();
    expect(created.error).toBeNull();

    const [unread, latest] = await Promise.all([
      unreadNotificationCount(userId),
      listNotificationsForUser(userId),
    ]);
    expect(unread).toBe(1);
    expect(latest).toHaveLength(1);
    expect(latest[0].title).toContain("REQ-1");
  });

  it("honours disabled channels as a preference", async () => {
    const userId = await makeUser("sms-off@example.com");
    await updateNotificationPreferences(userId, {
      email: true,
      sms: false,
      push: true,
      whatsapp: true,
    });

    const created = await sendNotification({
      userId,
      kind: "PAYMENT_PAID",
      reference: "REQ-2",
      vars: { ref: "REQ-2", summary: "Catering", amountLabel: "your payment" },
    });
    expect(created.channels).toEqual(["email", "push", "whatsapp"]);
    expect(created.channels).not.toContain("sms");

    const preferences = await listNotificationPreferences(userId);
    const sms = preferences.find((p) => p.channel === "sms");
    expect(sms?.enabled).toBe(false);
  });

  it("marks notifications read individually and in bulk", async () => {
    const userId = await makeUser("read@example.com");
    await sendNotification({ userId, kind: "DELIVERED", reference: "R1", vars: { ref: "R1", summary: "Parcels" } });
    await sendNotification({ userId, kind: "DELIVERED", reference: "R2", vars: { ref: "R2", summary: "Parcels" } });

    const unread = await unreadNotificationCount(userId);
    expect(unread).toBe(2);

    const [first] = await listNotificationsForUser(userId);
    const marked = await markNotificationRead(userId, first.id);
    expect(marked).toBe(true);
    expect(await unreadNotificationCount(userId)).toBe(1);

    // A foreign user cannot mark another user's notification read.
    const other = await makeUser("other@example.com");
    expect(await markNotificationRead(other, first.id)).toBe(false);

    expect(await markAllNotificationsRead(userId)).toBe(1);
    expect(await unreadNotificationCount(userId)).toBe(0);
  });

  it("records a FAILED status when no channel can deliver", async () => {
    const userId = await makeUser("disabled@example.com");
    await updateNotificationPreferences(userId, {
      email: false,
      sms: false,
      push: false,
      whatsapp: false,
    });

    const created = await sendNotification({
      userId,
      kind: "SUPPLIER_LEAD",
      reference: "REQ-3",
      vars: { ref: "REQ-3", summary: "Catering", categoryLabel: "Food & Drink" },
    });
    expect(created.status).toBe("FAILED");
    expect(created.channels).toEqual([]);
    expect(created.error).not.toBeNull();
  });
});

describe("notification preferences", () => {
  it("defaults every channel to enabled when no rows exist", async () => {
    const userId = await makeUser("defaults@example.com");
    const preferences = await listNotificationPreferences(userId);
    expect(preferences).toHaveLength(NOTIFICATION_CHANNELS.length);
    for (const p of preferences) {
      expect(p.enabled).toBe(true);
      expect(p.updatedAt).toBeNull();
    }
  });

  it("upserts preference rows and only accepts known channels", async () => {
    const userId = await makeUser("upsert@example.com");
    const preferences = await updateNotificationPreferences(userId, {
      email: true,
      sms: false,
      bogus: true,
    });
    const email = preferences.find((p) => p.channel === "email");
    const sms = preferences.find((p) => p.channel === "sms");
    expect(email?.enabled).toBe(true);
    expect(email?.updatedAt).not.toBeNull();
    expect(sms?.enabled).toBe(false);
    expect(sms?.updatedAt).not.toBeNull();
    expect(preferences.some((p) => (p.channel as string) === "bogus")).toBe(false);
    // Channels not touched keep the default (enabled) with no stored row.
    const push = preferences.find((p) => p.channel === "push");
    expect(push?.enabled).toBe(true);
    expect(push?.updatedAt).toBeNull();
  });
});