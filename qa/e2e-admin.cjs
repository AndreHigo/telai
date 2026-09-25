const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-admin-${process.pid}.sqlite`);
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const adminUsername = `qaadmin${suffix}`.slice(0, 32).toLowerCase();
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";
process.env.TELAI_ADMIN_USERNAMES = adminUsername;
process.env.TELAI_ADMIN_USER_IDS = "";
process.env.MIRANTE_MAINTENANCE_TOKEN = "qa-maintenance-token";

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, cookie: response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0] || "" };
}

async function register(baseUrl, username, displayName) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName, password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  assert.equal(result.response.status, 201);
  return { cookie: result.cookie, user: result.body.user };
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const admin = await register(baseUrl, adminUsername, "QA Admin");
    const outsider = await register(baseUrl, `qauser${suffix}`.slice(0, 32), "QA Usuário");
    const stream = await request(baseUrl, "/api/streams", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: JSON.stringify({ roomName: `admin-${suffix}`.slice(0, 40), title: "QA live aberta" }),
    });
    assert.equal(stream.response.status, 201);

    const unauthenticated = await request(baseUrl, "/api/admin/overview");
    assert.equal(unauthenticated.response.status, 401);
    const denied = await request(baseUrl, "/api/admin/overview", { headers: { cookie: outsider.cookie } });
    assert.equal(denied.response.status, 404);

    const overview = await request(baseUrl, "/api/admin/overview", { headers: { cookie: admin.cookie } });
    assert.equal(overview.response.status, 200);
    assert.equal(overview.body.summary.accounts, 2);
    assert.equal(overview.body.summary.openStreams, 1);
    assert.ok(overview.body.accounts.some((account) => account.username === adminUsername));
    assert.ok(overview.body.streams.some((item) => item.id === stream.body.stream.id));
    assert.equal(Object.hasOwn(overview.body.accounts[0], "passwordHash"), false);
    assert.equal(Object.hasOwn(overview.body.accounts[0], "password_hash"), false);

    const summary = await request(baseUrl, "/api/admin/summary", { headers: { cookie: admin.cookie } });
    assert.equal(summary.response.status, 200);
    assert.equal(summary.body.summary.accounts, 2);
    const accountsPage = await request(baseUrl, "/api/admin/accounts?page=1&pageSize=1", { headers: { cookie: admin.cookie } });
    assert.equal(accountsPage.response.status, 200);
    assert.equal(accountsPage.body.items.length, 1);
    assert.equal(accountsPage.body.pagination.total, 2);
    assert.equal(accountsPage.body.pagination.pageCount, 2);
    const streamsPage = await request(baseUrl, "/api/admin/streams?page=1&pageSize=1", { headers: { cookie: admin.cookie } });
    assert.equal(streamsPage.response.status, 200);
    assert.equal(streamsPage.body.items.length, 1);
    const createdGroup = await request(baseUrl, "/api/groups", {
      method: "POST",
      headers: { cookie: admin.cookie },
      body: JSON.stringify({ name: `QA Grupo ${suffix}` }),
    });
    assert.equal(createdGroup.response.status, 201);
    const groupsPage = await request(baseUrl, "/api/admin/groups?page=1&pageSize=1", { headers: { cookie: admin.cookie } });
    assert.equal(groupsPage.response.status, 200);
    assert.equal(groupsPage.body.items.length, 1);
    assert.equal(groupsPage.body.items[0].memberCount, 1);
    const membersPage = await request(baseUrl, `/api/admin/groups/${createdGroup.body.group.id}/members?page=1&pageSize=1`, { headers: { cookie: admin.cookie } });
    assert.equal(membersPage.response.status, 200);
    assert.equal(membersPage.body.pagination.total, 1);
    assert.equal(membersPage.body.items[0].username, adminUsername);

    const deniedPage = await request(baseUrl, "/admin", { headers: { cookie: outsider.cookie } });
    assert.equal(deniedPage.response.status, 404);
    const page = await request(baseUrl, "/admin", { headers: { cookie: admin.cookie } });
    assert.equal(page.response.status, 200);
    assert.match(page.response.headers.get("cache-control") || "", /no-store/);
    assert.match(page.response.headers.get("x-robots-tag") || "", /noindex/);
    assert.match(page.body, /Administração Telai/);

    const deniedMaintenance = await request(baseUrl, "/api/admin/maintenance", { method: "POST", headers: { cookie: outsider.cookie }, body: JSON.stringify({ delaySeconds: 10 }) });
    assert.equal(deniedMaintenance.response.status, 404);
    const scheduled = await request(baseUrl, "/api/admin/maintenance", { method: "POST", headers: { cookie: admin.cookie }, body: JSON.stringify({ delaySeconds: 30, durationSeconds: 120, message: "QA: manutenção programada" }) });
    assert.equal(scheduled.response.status, 201);
    assert.equal(scheduled.body.notice.message, "QA: manutenção programada");
    assert.ok(scheduled.body.notice.secondsUntilStart >= 29 && scheduled.body.notice.secondsUntilStart <= 30);
    const publicNotice = await request(baseUrl, "/api/maintenance");
    assert.equal(publicNotice.response.status, 200);
    assert.equal(publicNotice.body.notice.id, scheduled.body.notice.id);
    assert.equal((await request(baseUrl, "/api/admin/maintenance", { method: "DELETE", headers: { cookie: admin.cookie } })).response.status, 200);
    assert.equal((await request(baseUrl, "/api/maintenance")).body.notice, null);
    const tokenScheduled = await request(baseUrl, "/api/admin/maintenance", { method: "POST", headers: { "x-telai-maintenance-token": "qa-maintenance-token" }, body: JSON.stringify({ delaySeconds: 10 }) });
    assert.equal(tokenScheduled.response.status, 201);
    assert.equal((await request(baseUrl, "/api/admin/maintenance", { method: "DELETE", headers: { "x-telai-maintenance-token": "qa-maintenance-token" } })).response.status, 200);

    const robots = await request(baseUrl, "/robots.txt");
    assert.match(robots.body, /Disallow: \/admin/);
    assert.match(robots.body, /Disallow: \/api\/admin\//);
    console.log(JSON.stringify({ ok: true, admin: admin.user.username, summary: overview.body.summary }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
