import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes and verifies a password round-trip", async () => {
    const hashValue = await hashPassword("s3cure-passphrase!");
    expect(hashValue).toBeTruthy();
    expect(hashValue).not.toContain("s3cure-passphrase!");
    await expect(verifyPassword("s3cure-passphrase!", hashValue)).resolves.toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const hashValue = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", hashValue)).resolves.toBe(
      false,
    );
  });

  it("produces distinct hashes for the same password (salting)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});