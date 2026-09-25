const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");
const { loadPostgresTestEnv } = require("./postgres-test-env.cjs");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.POSTGRES_API_QA_PORT || 8850 + (process.pid % 500));
const baseUrl = `http://127.0.0.1:${port}`;
loadPostgresTestEnv();

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required");

const databaseName = `telai_api_qa_${process.pid}_${Date.now().toString(36)}`.slice(0, 63);
let databaseCreated = false;
let server = null;
let testProcess = null;
let serverOutput = "";

function databaseUrl(database) {
  const url = new URL(sourceDatabaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function clientOptions(connectionString) {
  const sslRequired = String(process.env.DATABASE_SSL || "").trim().toLowerCase() === "require";
  return {
    connectionString,
    ssl: sslRequired ? { rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || "true").trim().toLowerCase() !== "false" } : undefined,
  };
}

async function createDatabase() {
  const adminUrl = databaseUrl("postgres");
  const client = new Client(clientOptions(adminUrl));
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  if (!databaseCreated) return;
  const client = new Client(clientOptions(databaseUrl("postgres")));
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await client.end();
  }
  databaseCreated = false;
}

function applyMigrations() {
  const result = spawnSync(process.execPath, [path.join(__dirname, "migrate-postgres.mjs")], {
    cwd: rootDir,
    env: {
      ...process.env,
      TELAI_DATABASE_DRIVER: "postgres",
      DATABASE_URL: databaseUrl(databaseName),
    },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`PostgreSQL migration exited with ${result.status}`);
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  let lastBody = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      const body = await response.json().catch(() => ({}));
      lastBody = JSON.stringify(body);
      if (response.ok && body.databaseDriver === "postgres") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor PostgreSQL de QA não iniciou na porta ${port}: ${lastBody}`);
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2_000).unref();
  });
}

async function main() {
  try {
    await createDatabase();
    applyMigrations();
    server = spawn(process.execPath, [path.join(rootDir, "server.mjs")], {
      cwd: rootDir,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        REQUIRE_LOGIN: "true",
        MIRANTE_API_RATE_LIMIT_PER_MIN: "1000",
        MIRANTE_API_WRITE_RATE_LIMIT_PER_MIN: "1000",
        MIRANTE_API_GLOBAL_RATE_LIMIT_PER_MIN: "2000",
        MIRANTE_GROUP_OVERVIEW_RATE_LIMIT_PER_MIN: "1000",
        TELAI_DATABASE_DRIVER: "postgres",
        TELAI_MAINTENANCE_DATABASE_DRIVER: "postgres",
        DATABASE_URL: databaseUrl(databaseName),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
    server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });
    await waitForHealth();
    testProcess = spawn(process.execPath, [path.join(__dirname, "e2e-api.cjs")], {
      cwd: rootDir,
      env: { ...process.env, BASE_URL: baseUrl, EXPECTED_DATABASE_DRIVER: "postgres" },
      stdio: "inherit",
    });
    const exitCode = await new Promise((resolve, reject) => {
      testProcess.on("error", reject);
      testProcess.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    if (exitCode !== 0) throw new Error(`API PostgreSQL QA exited with ${exitCode}`);
    console.log(JSON.stringify({ ok: true, databaseDriver: "postgres", isolatedDatabase: true }));
  } catch (error) {
    if (server && serverOutput) process.stderr.write(serverOutput);
    throw error;
  } finally {
    await stopProcess(testProcess);
    await stopProcess(server);
    await dropDatabase();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
