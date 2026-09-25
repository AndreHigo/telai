const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const WebSocket = require("ws");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-observability-${process.pid}.sqlite`);
const port = 8890 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("servidor não iniciou no tempo esperado")), 10_000);
    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes("Telai em")) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      if (code !== null) {
        clearTimeout(timer);
        reject(new Error(`servidor encerrou durante o boot: ${code}`));
      }
    });
  });
}

async function main() {
  const child = spawn(process.execPath, [path.join(rootDir, "server.mjs")], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      REQUIRE_LOGIN: "true",
      MIRANTE_DB_PATH: databasePath,
      MIRANTE_DOWNLOAD_RATE_LIMIT_PER_MIN: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  try {
    await waitForServer(child);
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    const metrics = await fetch(`${baseUrl}/metrics`);
    assert.equal(metrics.status, 200);
    const snapshot = await metrics.json();
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.mediaMode, "p2p");
    assert.ok(snapshot.requests.total >= 2);
    assert.ok(snapshot.requests.topRoutes.some((entry) => entry.route === "/healthz"));

    const firstDownload = await fetch(`${baseUrl}/download`, { method: "HEAD" });
    assert.ok([200, 404].includes(firstDownload.status), `download inesperado: ${firstDownload.status}`);
    const secondDownload = await fetch(`${baseUrl}/download`, { method: "HEAD" });
    assert.equal(secondDownload.status, 429);
    assert.equal(secondDownload.headers.get("retry-after"), "60");

    const after = await (await fetch(`${baseUrl}/metrics`)).json();
    assert.ok(after.requests.topRoutes.some((entry) => entry.route === "/download"));

    const clientErrorResponse = await fetch(`${baseUrl}/api/client-errors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "qa_probe", message: "diagnóstico de teste", stack: "Error: diagnóstico de teste", context: { token: "nao-deve-aparecer", source: "qa" } }),
    });
    assert.equal(clientErrorResponse.status, 202);

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(`${baseUrl.replace("http:", "ws:")}/signal`);
      const timer = setTimeout(() => { socket.close(); reject(new Error("websocket não abriu no tempo esperado")); }, 5000);
      socket.once("open", () => {
        clearTimeout(timer);
        socket.send(JSON.stringify({ type: "invalid-qa-message" }));
        setTimeout(() => { socket.close(); resolve(); }, 50);
      });
      socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    });

    const afterDiagnostics = await (await fetch(`${baseUrl}/metrics`)).json();
    assert.ok(afterDiagnostics.websocket.connections >= 1);
    assert.ok(afterDiagnostics.logging.recentEvents.some((entry) => entry.event === "client_error"));
    assert.ok(afterDiagnostics.clientEvents.some((entry) => entry.route === "qa_probe" && entry.value >= 1));
    assert.ok(!JSON.stringify(afterDiagnostics.logging.recentEvents).includes("nao-deve-aparecer"));

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: `obs${Date.now()}${process.pid}`.slice(0, 32), displayName: "Observability QA", password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
    });
    assert.equal(registerResponse.status, 201);
    const registered = await registerResponse.json();
    const cookie = registerResponse.headers.get("set-cookie")?.split(",")[0]?.split(";")[0];
    assert.match(cookie || "", /^mirante_session=/);
    const groupResponse = await fetch(`${baseUrl}/api/groups`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Observability Group" }),
    });
    assert.equal(groupResponse.status, 201);
    const group = await groupResponse.json();
    const database = new DatabaseSync(databasePath);
    database.prepare("UPDATE users SET avatar_data = ? WHERE id = ?")
      .run(`data:image/png;base64,${"A".repeat(600_000)}`, registered.user.id);
    database.close();
    const overviewResponse = await fetch(`${baseUrl}/api/groups/${group.group.id}/overview`, { headers: { cookie } });
    assert.equal(overviewResponse.status, 200);
    const overviewText = await overviewResponse.text();
    assert.ok(overviewText.length < 100_000, `overview ainda está grande: ${overviewText.length} bytes`);
    const overview = JSON.parse(overviewText);
    assert.equal(overview.members[0].avatarData, null);
    console.log(JSON.stringify({ ok: true, requests: after.requests, websocket: after.websocket }));
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
    if (stderr.trim()) process.stderr.write(stderr);
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
