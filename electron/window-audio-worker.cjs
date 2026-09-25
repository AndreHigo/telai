const loopback = require("@kokapuk/application-loopback");
const { LoopbackCapture } = require("loopback-capture");

const parentPort = process.parentPort;
let capturing = false;
let processCapture = null;

if (!parentPort) process.exit(1);

function reply(id, payload) {
  parentPort.postMessage({ type: "response", id, ...payload });
}

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

parentPort.on("message", (event) => {
  const message = event?.data || event || {};
  const id = message.id;

  if (message.type === "list-windows") {
    try {
      const windows = loopback.getVisibleWindows().map((item) => ({
        processId: item.processId,
        processName: item.processName,
        title: item.title,
      }));
      reply(id, { ok: true, windows });
    } catch (error) {
      reply(id, { ok: false, message: errorMessage(error, "Não foi possível listar as janelas.") });
    }
    return;
  }

  if (message.type === "start") {
    if (capturing) {
      reply(id, { ok: false, message: "A captura de áudio da janela já está ativa." });
      return;
    }
    try {
      if (message.captureMode === "system-exclude") {
        const processId = Number(message.processId);
        if (!Number.isInteger(processId) || processId <= 0) throw new Error("Não foi possível identificar o processo do Telai.");
        processCapture = new LoopbackCapture();
        processCapture.start(processId, false, (chunk) => {
          if (capturing) parentPort.postMessage({ type: "chunk", chunk: Buffer.from(chunk) });
        });
        capturing = true;
        reply(id, { ok: true, sampleRate: 48000, channels: 2, format: "s16le", mode: "system-exclude", excludedProcessId: processId });
        return;
      }
      loopback.startLoopbackCapture(
        Number(message.processId),
        (chunk) => {
          if (capturing) parentPort.postMessage({ type: "chunk", chunk: Buffer.from(chunk) });
        },
        () => {
          capturing = false;
          parentPort.postMessage({ type: "status", status: "ended" });
        },
      );
      capturing = true;
      reply(id, { ok: true, sampleRate: 48000, channels: 2, format: "s16le" });
    } catch (error) {
      if (processCapture) {
        try { processCapture.stop(); } catch {}
        processCapture = null;
      }
      capturing = false;
      reply(id, { ok: false, message: errorMessage(error, "Não foi possível iniciar o áudio da janela.") });
    }
    return;
  }

  if (message.type === "stop") {
    try {
      if (processCapture) {
        processCapture.stop();
        processCapture = null;
      } else {
        loopback.stopLoopbackCapture();
      }
      capturing = false;
      reply(id, { ok: true });
    } catch (error) {
      capturing = false;
      reply(id, { ok: false, message: errorMessage(error, "Não foi possível parar o áudio da janela.") });
    }
  }
});
