const assert = require("node:assert/strict");
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-events-ui-${process.pid}-${Date.now()}.sqlite`);
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathName} retornou ${response.status}: ${body.error || "erro"}`);
  return { response, body, cookie: response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0] || "" };
}

async function register(baseUrl, username, displayName) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName, password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  return { cookie: result.cookie, user: result.body.user };
}

async function evaluate(window, expression) {
  if (window.isDestroyed()) throw new Error("janela de teste foi encerrada");
  return window.webContents.executeJavaScript(`(${expression})()`, true);
}

async function waitFor(label, check, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`${label} não ficou pronto.`);
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}${process.pid}`;
  let window;
  try {
    const owner = await register(baseUrl, `qa_events_ui_owner_${suffix}`.slice(0, 32), "QA Events UI Owner");
    const member = await register(baseUrl, `qa_events_ui_member_${suffix}`.slice(0, 32), "QA Events UI Member");
    const group = await request(baseUrl, "/api/groups", {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ name: `QA Events UI ${suffix}`, slug: `qa-events-ui-${suffix}`.slice(0, 64) }),
    });
    const groupId = group.body.group.id;
    const join = await request(baseUrl, `/api/groups/${groupId}/join-requests`, { method: "POST", headers: { cookie: member.cookie } });
    await request(baseUrl, `/api/groups/${groupId}/join-requests/${join.body.request.id}`, {
      method: "PATCH",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ status: "approved" }),
    });
    const overview = await request(baseUrl, `/api/groups/${groupId}/overview`, { headers: { cookie: owner.cookie } });
    const textRoom = overview.body.rooms.find((room) => room.kind === "text");
    assert.ok(textRoom, "sala de texto não encontrada");

    await session.defaultSession.cookies.set({ url: baseUrl, name: "mirante_session", value: owner.cookie.slice("mirante_session=".length), httpOnly: true, sameSite: "lax" });
    window = new BrowserWindow({ show: false, width: 1280, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await window.loadURL(`${baseUrl}/svelte/`);
    await waitFor("painel autenticado", () => evaluate(window, () => Boolean(document.querySelector(".user-menu-chip"))));
    await evaluate(window, () => [...document.querySelectorAll(".global-sidebar-item, .nav-card")].find((item) => item.textContent.includes("Meus grupos"))?.click());
    await waitFor("seletor de grupos", () => evaluate(window, () => Boolean(document.querySelector(".groups-picker-card"))));
    await evaluate(window, () => document.querySelector(".groups-picker-card")?.click());
    await waitFor("workspace do grupo", () => evaluate(window, () => Boolean(document.querySelector(".discord-layout"))));
    await waitFor("canal de texto selecionado", () => evaluate(window, () => Boolean(document.querySelector(".chat-workspace .message-list"))));

    const messageBody = `evento-ui-${suffix}`;
    await request(baseUrl, `/api/groups/${groupId}/messages`, {
      method: "POST",
      headers: { cookie: member.cookie },
      body: JSON.stringify({ roomId: textRoom.id, body: messageBody }),
    });
    const messageLiteral = JSON.stringify(messageBody);
    await waitFor("mensagem entregue pelo gateway à interface", () => evaluate(window, `() => document.querySelector(".chat-workspace .message-list")?.textContent.includes(${messageLiteral})`), 8_000);
    console.log(JSON.stringify({ ok: true, uiEventDelivery: true, pollingHistoryDisabled: true }));
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); app.exit(1); });
