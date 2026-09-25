import { randomBytes } from "node:crypto";

export function slugFor(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function roomSlugFor(value) {
  return slugFor(value).slice(0, 42) || `sala-${randomBytes(4).toString("hex")}`;
}

export function parseVoiceRoomParticipantLimit(value, fallback = 8) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(50, Math.max(1, parsed));
}
