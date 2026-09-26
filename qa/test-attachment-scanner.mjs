import assert from "node:assert/strict";
import { createAttachmentScanner } from "../server/media/attachment-scanner.mjs";

const disabled = createAttachmentScanner();
assert.equal(disabled.mode, "disabled");
assert.deepEqual(await disabled.scan({ buffer: Buffer.from("Telai"), mimeType: "text/plain" }), { clean: true, skipped: true });

const scanner = createAttachmentScanner({ command: process.execPath, timeoutMs: 5_000 });
assert.equal(scanner.mode, "command");
await assert.rejects(() => scanner.scan({ buffer: Buffer.from("Telai"), mimeType: "text/plain" }), /attachment-scan-failed/);

console.log(JSON.stringify({ ok: true, checks: 4, disabledByDefault: true, commandMode: true }));
