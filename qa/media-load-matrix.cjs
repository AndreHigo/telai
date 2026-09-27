const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const electronBinary = require("electron");
const requestedCounts = String(process.env.TELAI_MEDIA_MATRIX || "1,5,10,20")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 20);
const counts = [...new Set(requestedCounts.length ? requestedCounts : [1, 5, 10, 20])];
const mediaMode = process.env.TELAI_MEDIA_MATRIX_MODE === "relay" ? "relay" : "p2p";

function stripTerminalControl(text) {
  return String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r/g, "");
}

function extractResultJson(text) {
  const start = text.lastIndexOf('{"ok":true');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

function runMediaScenario(viewerCount) {
  return new Promise((resolve, reject) => {
    const resultFile = path.join(rootDir, `.tmp-media-matrix-${process.pid}-${viewerCount}-${Date.now()}.json`);
    const fail = (error) => {
      fs.rmSync(resultFile, { force: true });
      reject(error);
    };
    const child = spawn(electronBinary, ["--no-sandbox", path.join(rootDir, "qa", "e2e-media.cjs")], {
      cwd: rootDir,
      env: { ...process.env, MEDIA_MODE: mediaMode, TELAI_MEDIA_VIEWER_COUNT: String(viewerCount), TELAI_MEDIA_RESULT_FILE: resultFile },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", fail);
    child.on("close", (code, signal) => {
      try {
        const resultJson = fs.existsSync(resultFile) ? fs.readFileSync(resultFile, "utf8") : null;
        const normalized = stripTerminalControl(output);
        const fallbackJson = extractResultJson(normalized);
        if (code !== 0 || (!resultJson && !fallbackJson)) {
          const tail = normalized.trim().split(/\n/).slice(-12).join("\n");
          const diagnostics = normalized.split(/\n/).filter((line) => line.includes("qa_render_process") || line.includes("qa_window_all_closed")).slice(-8).join("\n");
          reject(new Error(`cenário ${viewerCount} viewers falhou (exit=${code}, signal=${signal || "none"})${diagnostics ? `\ndiagnostics=${diagnostics}` : ""}\n${tail}`));
          return;
        }
        const parsed = JSON.parse(resultJson || fallbackJson);
        if (!parsed.ok) {
          fail(new Error(`cenário ${viewerCount} viewers não concluiu: ${parsed.error || "erro sem descrição"}`));
          return;
        }
        resolve(parsed);
      } catch (error) {
        fail(new Error(error.message.startsWith("cenário ") ? error.message : `resultado do cenário ${viewerCount} viewers não é JSON válido: ${error.message}`));
      } finally {
        fs.rmSync(resultFile, { force: true });
      }
    });
  });
}

async function main() {
  const scenarios = [];
  const failures = [];
  const inconclusive = [];
  for (const viewerCount of counts) {
    process.stdout.write(`media-matrix: executando ${mediaMode}/${viewerCount} viewers...\n`);
    try {
      scenarios.push(await runMediaScenario(viewerCount));
    } catch (error) {
      const message = error.message || "erro sem descrição";
      if (message.includes("harness encerrou antes do resultado final")) {
        inconclusive.push({ viewers: viewerCount, error: message });
      } else {
        failures.push({ viewers: viewerCount, error: message });
      }
    }
  }
  const rows = scenarios.map((scenario) => ({
    mode: scenario.mediaMode,
    viewers: scenario.multistream.loadBenchmark.viewerCount,
    loadMs: scenario.multistream.loadBenchmark.elapsedMs,
    processCpuPercent: scenario.multistream.loadBenchmark.processCpuPercent,
    processRssMiB: Math.round((scenario.multistream.loadBenchmark.processRssBytes / 1024 / 1024) * 10) / 10,
    frameCount: scenario.multistream.frameCount,
    rtcPeerCount: scenario.viewer.rtcQuality?.second?.peerCount ?? null,
    codecs: scenario.viewer.rtcQuality?.second?.peers?.flatMap((peer) => peer.sample?.codecs || []) || [],
  }));
  const result = { ok: failures.length === 0, mediaMode, scenarios: rows, failures, inconclusive };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }));
  process.exitCode = 1;
});
