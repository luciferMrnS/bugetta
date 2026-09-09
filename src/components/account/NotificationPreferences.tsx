"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/client/apiClient";

interface PreferenceView {
  channel: string;
  label: string;
  enabled: boolean;
  updatedAt: string | null;
}

type Payload = { preferences: PreferenceView[] };

const CHANNEL_BLURBS: Record<string, string> = {
  email: "Extracts and daily updates land in your inbox.",
  sms: "Short alerts for time-sensitive steps (paid, delivered).",
  push: "Real-time updates in the BUGETTA app.",
  whatsapp: "Conversational updates on WhatsApp.",
};

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<PreferenceView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Payload>("/api/account/notification-preferences")
      .then((data) => setPreferences(data.preferences))
      .catch(() => setPreferences([]));
  }, []);

  async function toggle(channel: string) {
    if (!preferences) return;
    const next = preferences.map((p) =>
      p.channel === channel ? { ...p, enabled: !p.enabled } : p,
    );
    setPreferences(next);
    setSaved(false);
    setError(null);
    setSaving(true);
    try {
      const body = Object.fromEntries(
        next.map((p) => [p.channel, p.enabled]),
      ) as Record<string, boolean>;
      const data = await apiFetch<Payload>(
        "/api/account/notification-preferences",
        { method: "PUT", body },
      );
      setPreferences(data.preferences);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save preferences.",
      );
      // Revert to the last saved state on failure.
      apiFetch<Payload>("/api/account/notification-preferences").then((d) =>
        setPreferences(d.preferences),
      );
    } finally {
      setSaving(false);
    }
  }

  if (preferences === null) {
    return <p className="text-sm text-zinc-400">Loading preferences…</p>;
  }

  return (
    <section
      aria-label="Notification preferences"
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Notification channels
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Choose where we send updates about your requests. Missing rows default
          to on.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {preferences.map((pref) => (
          <li
            key={pref.channel}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium capitalize">
                {pref.label}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {CHANNEL_BLURBS[pref.channel] ?? "Receive updates on this channel."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pref.enabled}
              aria-label={`${pref.label} ${pref.enabled ? "on" : "off"}`}
              onClick={() => toggle(pref.channel)}
              disabled={saving}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                pref.enabled
                  ? "bg-foreground"
                  : "bg-black/10 dark:bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  pref.enabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && (
        <p className="text-xs text-emerald-600" aria-live="polite">
          Preferences saved.
        </p>
      )}
    </section>
  );
}