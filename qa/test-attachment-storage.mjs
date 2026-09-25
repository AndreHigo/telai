import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAttachmentStorage, createS3AttachmentStorage } from "../server/media/attachment-storage.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "telai-attachment-storage-"));
try {
  const local = createAttachmentStorage({ mode: "local", localRootDir: root });
  const localKey = await local.write({ attachmentId: "attachment-local", mimeType: "text/plain", buffer: Buffer.from("Telai") });
  assert.equal(localKey, "attachment-local.plain");
  assert.deepEqual(await local.read(localKey), Buffer.from("Telai"));
  await local.remove(localKey);
  await assert.rejects(() => local.read(localKey));

  const calls = [];
  const s3 = createS3AttachmentStorage({
    endpoint: "https://minio.example.test",
    bucket: "telai-files",
    accessKeyId: "qa-access",
    secretAccessKey: "qa-secret",
    prefix: "qa",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (options.method === "GET") return new Response("remote-content", { status: 200 });
      return new Response(null, { status: options.method === "DELETE" ? 204 : 200 });
    },
  });
  const s3Key = await s3.write({ attachmentId: "attachment-s3", mimeType: "text/plain", buffer: Buffer.from("remote-content") });
  assert.equal(s3Key, "qa/attachment-s3.plain");
  assert.match(calls[0].url, /\/telai-files\/qa\/attachment-s3\.plain$/);
  assert.match(calls[0].options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=qa-access\//);
  assert.equal(calls[0].options.headers["x-amz-content-sha256"].length, 64);
  assert.deepEqual(await s3.read(s3Key), Buffer.from("remote-content"));
  await s3.remove(s3Key);
  assert.deepEqual(calls.map((call) => call.options.method), ["PUT", "GET", "DELETE"]);
  await assert.rejects(() => s3.read("../escape.txt"), /attachment-key-invalid/);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, checks: 12 }));
