import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalAttachmentStorage } from "../server/media/attachment-storage.mjs";
import { createAttachmentLifecycle } from "../server/services/attachment-lifecycle.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "telai-attachment-lifecycle-"));
try {
  const storage = createLocalAttachmentStorage(root);
  const referencedKey = await storage.write({ attachmentId: "referenced", mimeType: "text/plain", buffer: Buffer.from("keep") });
  const orphanKey = await storage.write({ attachmentId: "orphan", mimeType: "text/plain", buffer: Buffer.from("remove") });
  const freshKey = await storage.write({ attachmentId: "fresh", mimeType: "text/plain", buffer: Buffer.from("wait") });
  const oldDate = new Date(100_000);
  await fs.utimes(path.join(root, orphanKey), oldDate, oldDate);
  await fs.utimes(path.join(root, referencedKey), oldDate, oldDate);
  const logs = [];
  const lifecycle = createAttachmentLifecycle({
    groupAttachmentRepository: { listStorageKeys: () => [referencedKey] },
    attachmentStorage: storage,
    orphanGraceMs: 10_000,
    maxDeletesPerRun: 10,
    now: () => 200_000,
    infoLog: (event, fields) => logs.push({ event, fields }),
  });
  const result = await lifecycle.pruneOrphanedStorage();
  assert.deepEqual(result, { supported: true, removed: 1, scanned: 2 });
  await assert.rejects(() => storage.read(orphanKey), /ENOENT/);
  assert.equal((await storage.read(referencedKey)).toString(), "keep");
  assert.equal((await storage.read(freshKey)).toString(), "wait");
  assert.equal(logs[0].event, "attachment_orphans_removed");
  console.log(JSON.stringify({ ok: true, orphanRemoved: true, referencedPreserved: true, freshPreserved: true }));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
