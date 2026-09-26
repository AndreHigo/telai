import assert from "node:assert/strict";
import { formatBroadcastCaptureError, formatBroadcastMissingAudio } from "../frontend/src/features/broadcast/capture-errors.js";

assert.match(formatBroadcastCaptureError({ name: "NotAllowedError" }, "camera"), /câmera foi recusado/);
assert.match(formatBroadcastCaptureError({ name: "NotFoundError" }, "screen"), /tela ou janela/);
assert.match(formatBroadcastCaptureError({ name: "NotReadableError" }), /não conseguiu acessar/);
assert.equal(formatBroadcastCaptureError({ message: "falha de teste" }), "falha de teste");
assert.match(formatBroadcastMissingAudio({ isDesktop: true }), /Windows não entregou áudio/);
assert.match(formatBroadcastMissingAudio({ displaySurface: "screen" }), /tela inteira/);
assert.match(formatBroadcastMissingAudio({ selectionKind: "window" }), /janela/);
console.log(JSON.stringify({ ok: true, checks: 7 }));
