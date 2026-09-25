import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function passwordMatches(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
