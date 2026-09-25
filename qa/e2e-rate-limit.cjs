const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.RATE_LIMIT_QA_PORT || 8801);
const databasePath = path.join(os.tmpdir(), `telai-rate-limit-qa-${process.pid}.sqlite`);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(rootDir, "server.mjs")], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    REQUIRE_LOGIN: "true",
    MIRANTE_DB_PATH: databasePath,
    MIRANTE_API_RATE_LIMIT_PER_MIN: "30",
    MIRANTE_API_WRITE_RATE_LIMIT_PER_MIN: "15",
    MIRANTE_API_GLOBAL_RATE_LIMIT_PER_MIN: "900",
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
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Servidor de rate limit não iniciou.\n${serverOutput}`);
}

async function login() {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "usuario-inexistente", password: "senha-errada" }),
  });
}

async function stopServer() {
  if (server.exitCode !== null) return;
  await new Promise((resolve) => {
    const finish = () => resolve();
    server.once("exit", finish);
    server.kill();
    setTimeout(() => {
      if (server.exitCode === null) server.kill();
      finish();
    }, 2_000).unref();
  });
}

async function main() {
  try {
    await waitForHealth();
    const apiResponses = [];
    for (let index = 0; index < 31; index += 1) apiResponses.push(await fetch(`${baseUrl}/api/auth/session`));
    assert.equal(apiResponses.at(-1).status, 429);
    assert.ok(apiResponses.at(-1).headers.get("retry-after"));
    assert.equal(apiResponses.at(-1).headers.get("x-ratelimit-limit"), "30");

    for (let index = 0; index < 15; index += 1) {
      assert.notEqual((await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" })).status, 429);
    }
    assert.equal((await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" })).status, 429);
    assert.notEqual((await fetch(`${baseUrl}/api/notifications/read-all`, { method: "POST" })).status, 429);

    for (let index = 0; index < 5; index += 1) assert.equal((await login()).status, 401);
    const blocked = await login();
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
    console.log(JSON.stringify({ ok: true, checks: ["api-per-route", "independent-write-buckets", "login-failure-lockout"] }));
  } finally {
    await stopServer();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
