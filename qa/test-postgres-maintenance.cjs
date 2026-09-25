const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadPostgresTestEnv } = require("./postgres-test-env.cjs");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.POSTGRES_MAINTENANCE_QA_PORT || 8817);
const baseUrl = `http://127.0.0.1:${port}`;
const databasePath = path.join(os.tmpdir(), `telai-postgres-maintenance-${process.pid}.sqlite`);
const maintenanceToken = `qa-maintenance-${process.pid}`;
loadPostgresTestEnv();
const postgresUrl = process.env.DATABASE_URL;

if (!postgresUrl) throw new Error("DATABASE_URL is required");

const server = spawn(process.execPath, [path.join(rootDir, "server.mjs")], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    REQUIRE_LOGIN: "true",
    MIRANTE_DB_PATH: databasePath,
    TELAI_DATABASE_DRIVER: "sqlite",
    TELAI_MAINTENANCE_DATABASE_DRIVER: "postgres",
    TELAI_MAINTENANCE_TOKEN: maintenanceToken,
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

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json();
  return { response, body };
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2_000).unref();
  });
}

function removeDatabase() {
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

async function main() {
  try {
    await waitForHealth();

    const initial = await jsonRequest("/api/maintenance");
    if (!initial.response.ok || initial.body.notice !== null) throw new Error("maintenance initial state is not empty");

    const scheduled = await jsonRequest("/api/admin/maintenance", {
      method: "POST",
      headers: { "x-telai-maintenance-token": maintenanceToken },
      body: JSON.stringify({ delaySeconds: 10, durationSeconds: 120, message: "PostgreSQL maintenance QA" }),
    });
    if (scheduled.response.status !== 201 || scheduled.body.notice?.message !== "PostgreSQL maintenance QA") {
      throw new Error(`maintenance schedule failed: ${JSON.stringify(scheduled.body)}`);
    }

    const fetched = await jsonRequest("/api/maintenance");
    if (fetched.body.notice?.message !== "PostgreSQL maintenance QA") throw new Error("maintenance notice was not read from PostgreSQL");

    const cleared = await jsonRequest("/api/admin/maintenance", {
      method: "DELETE",
      headers: { "x-telai-maintenance-token": maintenanceToken },
    });
    if (cleared.response.status !== 200 || cleared.body.ok !== true) throw new Error("maintenance clear failed");

    const finalState = await jsonRequest("/api/maintenance");
    if (finalState.body.notice !== null) throw new Error("maintenance notice was not cleared");

    console.log(JSON.stringify({ ok: true, maintenanceDriver: "postgres", schedule: true, read: true, clear: true }));
  } finally {
    await stopProcess(server);
    removeDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
