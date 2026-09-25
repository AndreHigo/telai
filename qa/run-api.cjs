const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.API_QA_PORT || 8799);
const databasePath = path.join(os.tmpdir(), `telai-api-qa-${process.pid}.sqlite`);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(rootDir, "server.mjs")], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    REQUIRE_LOGIN: "true",
    MIRANTE_DB_PATH: databasePath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor de QA não iniciou na porta ${port}.\n${serverOutput}`);
}

function removeDatabase() {
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000).unref();
  });
}

async function main() {
  let testProcess;
  try {
    await waitForHealth();
    testProcess = spawn(process.execPath, [path.join(__dirname, "e2e-api.cjs")], {
      cwd: rootDir,
      env: { ...process.env, BASE_URL: baseUrl },
      stdio: "inherit",
    });
    const exitCode = await new Promise((resolve, reject) => {
      testProcess.on("error", reject);
      testProcess.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await stopProcess(testProcess);
    await stopProcess(server);
    removeDatabase();
  }
}

main();
