import type { User } from "@/generated/prisma/client";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
}

type UserLike = Pick<User, "id" | "email" | "name" | "phone" | "role" | "status" | "createdAt">;

// Never leaks the password hash (structurally excludes it).
export function serializeUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}