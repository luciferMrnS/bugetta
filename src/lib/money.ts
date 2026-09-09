export function minorUnitsFromMajor(majorAmount: number): number {
  if (!Number.isFinite(majorAmount)) {
    throw new TypeError("amount must be a finite number");
  }

  return Math.round(majorAmount * 100);
}

export function majorUnitsFromMinor(minorAmount: number): number {
  if (!Number.isFinite(minorAmount)) {
    throw new TypeError("amount must be a finite number");
  }

  return minorAmount / 100;
}

export function formatNaira(minorAmount: number): string {
  const major = majorUnitsFromMinor(minorAmount);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(major);
}