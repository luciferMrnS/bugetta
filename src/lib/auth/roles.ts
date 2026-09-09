export const ROLES = {
  CUSTOMER: "CUSTOMER",
  OPERATIONS: "OPERATIONS",
  ADMIN: "ADMIN",
  SUPPLIER: "SUPPLIER",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];