const { app, utilityProcess } = require("electron");
const path = require("node:path");

const workerPath = path.join(__dirname, "..", "electron", "window-audio-worker.cjs");
let worker = null;
let timer = null;
let started = false;
let chunks = 0;
let finished = false;

function finish(code, message) {
  if (finished) return;
  finished = true;
  if (timer) clearTimeout(timer);
  try { worker?.kill(); } catch {}
  if (message) console.log(JSON.stringify({ ok: code === 0, message, chunks }));
  app.exit(code);
}

app.whenReady().then(() => {
  worker = utilityProcess.fork(workerPath, [], { serviceName: "Telai Audio Exclude QA", stdio: "ignore" });
  worker.on("message", (event) => {
    const message = event?.data || event || {};
    if (message.type === "chunk") {
      chunks += 1;
      return;
    }
    if (message.type !== "response") return;
    if (message.id === 1) {
      if (!message.ok) return finish(1, message.message || "A captura WASAPI exclude não iniciou.");
      started = true;
      timer = setTimeout(() => worker.postMessage({ id: 2, type: "stop" }), 700);
      return;
    }
    if (message.id === 2) {
      finish(message.ok ? 0 : 1, message.ok ? "WASAPI exclude-target-process-tree iniciou e encerrou corretamente." : (message.message || "A captura WASAPI exclude não encerrou."));
    }
  });
  worker.on("error", (error) => finish(1, error?.message || "O worker de captura de áudio falhou."));
  worker.on("exit", (code) => {
    if (!finished) finish(code ? 1 : 0, code ? `O worker encerrou com código ${code}.` : "Worker encerrou sem erro.");
  });
  worker.postMessage({
    id: 1,
    type: "start",
    captureMode: "system-exclude",
    processId: process.pid,
  });
  setTimeout(() => {
    if (!started) finish(1, "A captura WASAPI exclude não respondeu em 10 segundos.");
  }, 10000);
});

app.on("window-all-closed", () => {});
