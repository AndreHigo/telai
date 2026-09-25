import path from "node:path";
export { createAttachmentStorage, createLocalAttachmentStorage, createS3AttachmentStorage } from "./attachment-storage.mjs";

export const MAX_MESSAGE_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENTS_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "video/mp4",
  "video/webm",
]);

function safeFileName(value) {
  const normalized = path.basename(String(value || "arquivo").trim()).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-{2,}/g, "-").slice(0, 120);
  return normalized || "arquivo";
}

export function normalizeMessageAttachments(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_MESSAGE_ATTACHMENTS) throw new Error("attachments-invalid");
  let totalBytes = 0;
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("attachment-invalid");
    const name = safeFileName(item.name);
    const mimeType = String(item.type || "application/octet-stream").trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("attachment-type-invalid");
    const match = String(item.data || "").match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/);
    if (!match || match[1].toLowerCase() !== mimeType) throw new Error("attachment-data-invalid");
    const encoded = match[2].replace(/\s+/g, "");
    if (!encoded || encoded.length % 4 === 1) throw new Error("attachment-data-invalid");
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new Error("attachment-too-large");
    totalBytes += buffer.length;
    if (totalBytes > MAX_MESSAGE_ATTACHMENTS_BYTES) throw new Error("attachments-too-large");
    return { name, mimeType, byteSize: buffer.length, buffer };
  });
}

export function attachmentContentDisposition(mimeType) {
  return /^(audio|image|video)\//.test(String(mimeType || "")) || mimeType === "application/pdf" || mimeType === "text/plain"
    ? "inline"
    : "attachment";
}

export function publicAttachment(attachment, groupId, attachmentUrlFor) {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    createdAt: attachment.createdAt,
    url: attachmentUrlFor(groupId, attachment.id),
  };
}
