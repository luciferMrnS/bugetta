import type {
  DeliveryProvider,
  DeliveryProviderDescriptor,
} from "@/lib/delivery/providers/types";
import { sandboxProvider } from "@/lib/delivery/providers/sandbox/provider";

// Provider registry. Logging providers keep logistics abstracted: routes and
// services only ever talk to a provider's key and re-resolve it here, so a new
// courier is a one-line registration plus its implementation.
const providersByName = new Map<string, DeliveryProvider>();

export function registerDeliveryProvider(provider: DeliveryProvider): void {
  providersByName.set(provider.key, provider);
}

export const DEFAULT_PROVIDER_KEY = "sandbox";

// Unknown keys fall back to the sandbox provider so a mis-typed provider never
// breaks a delivery assignment; the stored key still records what was asked.
export function getDeliveryProvider(
  key?: string | null,
): DeliveryProvider {
  const resolved = providersByName.get(key ?? DEFAULT_PROVIDER_KEY);
  return resolved ?? sandboxProvider;
}

export function listDeliveryProviders(): DeliveryProviderDescriptor[] {
  const registered = [...providersByName.values()].map(describeProvider);
  if (registered.some((p) => p.key === DEFAULT_PROVIDER_KEY)) {
    return registered;
  }
  return [describeProvider(sandboxProvider), ...registered];
}

export function describeProvider(
  provider: DeliveryProvider,
): DeliveryProviderDescriptor {
  return {
    key: provider.key,
    label: provider.label,
    description: provider.description,
    supportsTracking: provider.supportsTracking,
  };
}

registerDeliveryProvider(sandboxProvider);