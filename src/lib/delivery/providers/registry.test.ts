import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_KEY,
  describeProvider,
  getDeliveryProvider,
  listDeliveryProviders,
} from "@/lib/delivery/providers/registry";
import { sandboxProvider } from "@/lib/delivery/providers/sandbox/provider";

describe("delivery provider registry", () => {
  it("always exposes the built-in sandbox provider with metadata", () => {
    const providers = listDeliveryProviders();
    expect(providers.some((p) => p.key === "sandbox")).toBe(true);
    for (const provider of providers) {
      expect(provider.key.length).toBeGreaterThan(0);
      expect(provider.label.length).toBeGreaterThan(0);
      expect(typeof provider.description).toBe("string");
      expect(typeof provider.supportsTracking).toBe("boolean");
    }
  });

  it("resolves a registered provider by key", () => {
    const provider = getDeliveryProvider("sandbox");
    expect(provider.key).toBe("sandbox");
    expect(provider.label).toBe(sandboxProvider.label);
    expect(provider.supportsTracking).toBe(true);
    expect(typeof provider.quote).toBe("function");
    expect(provider.trackingUrl("TRK-abc123")).toBeNull();
  });

  it("falls back to the default provider for unknown keys", () => {
    const provider = getDeliveryProvider("dhl-lekki");
    expect(provider.key).toBe(DEFAULT_PROVIDER_KEY);
  });

  it("resolves null/undefined keys to the default", () => {
    expect(getDeliveryProvider(null).key).toBe(DEFAULT_PROVIDER_KEY);
    expect(getDeliveryProvider(undefined).key).toBe(DEFAULT_PROVIDER_KEY);
  });

  it("describes providers in a stable, cased shape", () => {
    const descriptor = describeProvider(sandboxProvider);
    expect(descriptor).toEqual({
      key: "sandbox",
      label: sandboxProvider.label,
      description: sandboxProvider.description,
      supportsTracking: true,
    });
  });
});