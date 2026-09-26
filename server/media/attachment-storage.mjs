import { createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function extensionForMimeType(mimeType) {
  const extension = String(mimeType || "").split("/", 2)[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return extension ? `.${extension}` : "";
}

function localStoragePath(rootDir, storageKey) {
  const normalized = String(storageKey || "");
  if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(normalized)) throw new Error("attachment-key-invalid");
  return path.join(rootDir, normalized);
}

export function createLocalAttachmentStorage(rootDir) {
  const absoluteRoot = path.resolve(rootDir);

  return {
    mode: "local",
    supportsListing: true,
    async write({ attachmentId, mimeType, buffer }) {
      await fs.mkdir(absoluteRoot, { recursive: true });
      const storageKey = `${attachmentId}${extensionForMimeType(mimeType) || ".bin"}`;
      await fs.writeFile(localStoragePath(absoluteRoot, storageKey), buffer, { flag: "wx" });
      return storageKey;
    },
    async read(storageKey) {
      return fs.readFile(localStoragePath(absoluteRoot, storageKey));
    },
    async remove(storageKey) {
      await fs.rm(localStoragePath(absoluteRoot, storageKey), { force: true });
    },
    async list({ olderThan = 0, limit = 1000 } = {}) {
      let entries = [];
      try {
        entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
      const files = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/^[a-zA-Z0-9_-]+\.[a-z0-9]+$/.test(entry.name)) continue;
        const filePath = path.join(absoluteRoot, entry.name);
        const stats = await fs.stat(filePath);
        if (Number.isFinite(olderThan) && stats.mtimeMs > olderThan) continue;
        files.push({ storageKey: entry.name, byteSize: stats.size, modifiedAt: stats.mtimeMs });
      }
      return files
        .sort((left, right) => left.modifiedAt - right.modifiedAt || left.storageKey.localeCompare(right.storageKey))
        .slice(0, Math.max(1, Number(limit) || 1000));
    },
  };
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(storageKey) {
  return String(storageKey || "").split("/").map(encodeRfc3986).join("/");
}

function validateObjectKey(storageKey) {
  const normalized = String(storageKey || "");
  if (!normalized || normalized.length > 512 || normalized.includes("\\") || normalized.includes("..") || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("attachment-key-invalid");
  }
  return normalized;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret, dateStamp, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), "aws4_request");
}

function endpointForObject({ endpoint, bucket, storageKey, forcePathStyle }) {
  const base = new URL(endpoint);
  const encodedKey = encodeObjectKey(storageKey);
  if (forcePathStyle) {
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${encodeRfc3986(bucket)}/${encodedKey}`;
  } else {
    base.hostname = `${bucket}.${base.hostname}`;
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${encodedKey}`;
  }
  return base;
}

function signedRequest({ method, endpoint, bucket, storageKey, region, accessKeyId, secretAccessKey, forcePathStyle, body, contentType }) {
  const url = endpointForObject({ endpoint, bucket, storageKey, forcePathStyle });
  const payloadHash = sha256(body || Buffer.alloc(0));
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const host = url.host;
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((key) => `${key}:${String(headers[key]).trim()}\n`).join("");
  const canonicalRequest = [
    method,
    url.pathname || "/",
    url.search.slice(1),
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(secretAccessKey, dateStamp, region, "s3")).update(stringToSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`;
  return { url, headers, body };
}

async function responseError(response, operation) {
  const details = await response.text().catch(() => "");
  const error = new Error(`attachment-storage-${operation}-failed`);
  error.status = response.status;
  error.details = details.slice(0, 500);
  return error;
}

export function createS3AttachmentStorage({
  endpoint,
  bucket,
  region = "us-east-1",
  accessKeyId,
  secretAccessKey,
  prefix = "telai/",
  forcePathStyle = true,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("attachment-s3-config-invalid");
  if (typeof fetchImpl !== "function") throw new Error("attachment-s3-fetch-unavailable");
  const normalizedPrefix = String(prefix || "").replace(/^\/+|\/+$/g, "");
  const keyFor = (attachmentId, mimeType) => `${normalizedPrefix ? `${normalizedPrefix}/` : ""}${attachmentId}${extensionForMimeType(mimeType) || ".bin"}`;

  async function request(operation, method, storageKey, body, contentType) {
    const normalizedKey = validateObjectKey(storageKey);
    const signed = signedRequest({ method, endpoint, bucket, storageKey: normalizedKey, region, accessKeyId, secretAccessKey, forcePathStyle, body, contentType });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 10_000));
    try {
      const response = await fetchImpl(signed.url, { method, headers: signed.headers, body, signal: controller.signal });
      if (!response.ok) throw await responseError(response, operation);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    mode: "s3",
    supportsListing: false,
    async write({ attachmentId, mimeType, buffer }) {
      const storageKey = keyFor(attachmentId, mimeType);
      await request("write", "PUT", storageKey, buffer, mimeType);
      return storageKey;
    },
    async read(storageKey) {
      const response = await request("read", "GET", storageKey);
      return Buffer.from(await response.arrayBuffer());
    },
    async remove(storageKey) {
      await request("remove", "DELETE", storageKey);
    },
  };
}

export function createAttachmentStorage({ mode = "local", localRootDir, s3 } = {}) {
  if (mode === "local") return createLocalAttachmentStorage(localRootDir);
  if (mode === "s3") return createS3AttachmentStorage(s3);
  throw new Error("attachment-storage-mode-invalid");
}
