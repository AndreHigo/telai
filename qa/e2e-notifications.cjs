const assert = require("node:assert/strict");
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-notifications-harness-${process.pid}.sqlite`);
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
  return { response, body };
}

async function register(baseUrl, username, displayName) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName, password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  const cookie = result.response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0];
  assert.match(cookie || "", /^mirante_session=/);
  return { cookie, user: result.body.user };
}

async function api(baseUrl, user, pathName, method = "GET", body) {
  return request(baseUrl, pathName, {
    method,
    headers: user ? { cookie: user.cookie } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function evaluate(window, expression) {
  if (window.isDestroyed()) throw new Error("janela de teste foi encerrada");
  return window.webContents.executeJavaScript(`(${expression})()`, true);
}

async function waitFor(label, check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label} não ficou pronto${lastError ? `: ${lastError.message}` : "."}`);
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}${process.pid}`;
  let window;
  try {
    const owner = await register(baseUrl, `qa_notify_owner_${suffix}`.slice(0, 32), "QA Notifications Owner");
    const member = await register(baseUrl, `qa_notify_member_${suffix}`.slice(0, 32), "QA Notifications Member");
    const groupResult = await api(baseUrl, owner, "/api/groups", "POST", {
      name: `QA Notifications ${suffix}`,
      slug: `qa-notifications-${suffix}`.slice(0, 64),
    });
    const groupId = groupResult.body.group.id;
    const joinResult = await api(baseUrl, member, `/api/groups/${groupId}/join-requests`, "POST", {});
    assert.equal(joinResult.response.status, 201);
    const secondGroup = await api(baseUrl, owner, "/api/groups", "POST", {
      name: `QA Notifications Secondary ${suffix}`,
      slug: `qa-notifications-secondary-${suffix}`.slice(0, 64),
    });
    const secondJoin = await api(baseUrl, member, `/api/groups/${secondGroup.body.group.id}/join-requests`, "POST", {});
    assert.equal(secondJoin.response.status, 201);
    const initialPreferences = await api(baseUrl, owner, "/api/auth/preferences");
    assert.equal(initialPreferences.body.preferences.liveNotificationScope, "related");
    const broadPreferences = await api(baseUrl, owner, "/api/auth/preferences", "PATCH", { liveNotificationScope: "all" });
    assert.equal(broadPreferences.body.preferences.liveNotificationScope, "all");
    const relatedPreferences = await api(baseUrl, owner, "/api/auth/preferences", "PATCH", { liveNotificationScope: "related" });
    assert.equal(relatedPreferences.body.preferences.liveNotificationScope, "related");
    const notificationsBefore = await api(baseUrl, owner, "/api/notifications");
    const unreadBefore = notificationsBefore.body.notifications.filter((item) => item.unread);
    assert.ok(unreadBefore.length >= 2, "as fixtures não criaram duas notificações não lidas");
    const notificationToOpen = unreadBefore[0];
    const forbiddenRead = await fetch(`${baseUrl}/api/notifications/${notificationToOpen.id}`, {
      method: "PATCH",
      headers: { cookie: member.cookie },
    });
    assert.equal(forbiddenRead.status, 404, "um usuário não pode marcar a notificação de outra pessoa como lida");

    await session.defaultSession.cookies.set({
      url: baseUrl,
      name: "mirante_session",
      value: owner.cookie.slice("mirante_session=".length),
      httpOnly: true,
      sameSite: "lax",
    });
    window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await window.loadURL(`${baseUrl}/svelte/`);
    await waitFor("painel autenticado", () => evaluate(window, () => Boolean(document.querySelector(".user-menu-chip"))));
    await evaluate(window, () => {
      const button = document.querySelector(".notification-button");
      if (!button) throw new Error("botão de notificações não encontrado");
      button.click();
    });
    await waitFor("cards de notificação", () => evaluate(window, () => document.querySelectorAll(".notification-card").length >= 2));
    const beforeClick = await evaluate(window, () => ({
      cards: document.querySelectorAll(".notification-card").length,
      buttonDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Marcar como lidas")?.disabled,
    }));
    assert.ok(beforeClick.cards >= 2);
    assert.equal(beforeClick.buttonDisabled, false);
    await evaluate(window, `() => {
      const card = document.querySelector('.notification-card[data-notification-id="${notificationToOpen.id}"]');
      if (!card) throw new Error("notificação de teste não está na lista");
      card.querySelector(".notification-open")?.click();
    }`);
    await waitFor("notificação individual marcada como lida", () => evaluate(window, () => document.querySelectorAll(".notification-card.unread").length === 1));
    const afterIndividualRead = await evaluate(window, () => ({
      cards: document.querySelectorAll(".notification-card").length,
      badge: document.querySelector(".notification-button b")?.textContent || "",
    }));
    assert.equal(afterIndividualRead.cards, beforeClick.cards, "clicar na notificação não deve removê-la");
    assert.equal(afterIndividualRead.badge, "1", "a contagem deve diminuir após ler uma notificação");
    const serverAfterIndividualRead = await api(baseUrl, owner, "/api/notifications");
    assert.ok(serverAfterIndividualRead.body.notifications.find((item) => item.id === notificationToOpen.id)?.readAt, "a leitura individual não foi persistida no servidor");

    await evaluate(window, () => {
      const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === "Marcar como lidas");
      if (!button || button.disabled) throw new Error("ação Marcar como lidas indisponível");
      button.click();
    });
    await waitFor("marcar como lidas preserva os avisos", () => evaluate(window, () => document.querySelectorAll(".notification-card").length === 2 && document.querySelectorAll(".notification-card.read").length === 2));
    const afterMarkAll = await evaluate(window, () => ({
      cards: document.querySelectorAll(".notification-card").length,
      unreadCards: document.querySelectorAll(".notification-card.unread").length,
      badge: document.querySelector(".notification-button b")?.textContent || "",
      markAllDisabled: [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Marcar como lidas")?.disabled,
    }));
    assert.deepEqual(afterMarkAll, { cards: 2, unreadCards: 0, badge: "", markAllDisabled: true });

    await evaluate(window, () => document.querySelector(".notification-hide-read input")?.click());
    await waitFor("filtro oculta lidas sem apagar", () => evaluate(window, () => document.querySelectorAll(".notification-card").length === 0 && Boolean(document.querySelector(".notifications-filter-empty"))));
    const hiddenReadNotifications = await api(baseUrl, owner, "/api/notifications");
    assert.ok(hiddenReadNotifications.body.notifications.length >= 2, "ocultar notificações não deve apagar dados do servidor");
    assert.equal(hiddenReadNotifications.body.unreadCount, 0);
    assert.equal(await evaluate(window, `() => localStorage.getItem("mirante-hide-read-notifications:${owner.user.id}")`), "true");

    await evaluate(window, () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Mostrar notificações lidas")?.click());
    await waitFor("opção mostra novamente lidas", () => evaluate(window, () => document.querySelectorAll(".notification-card").length === 2 && !document.querySelector(".notification-hide-read input")?.checked));
    await sleep(9_000);
    const afterPolling = await evaluate(window, () => ({
      cards: document.querySelectorAll(".notification-card").length,
      readCards: document.querySelectorAll(".notification-card.read").length,
      unreadCards: document.querySelectorAll(".notification-card.unread").length,
      badge: document.querySelector(".notification-button b")?.textContent || "",
    }));
    assert.deepEqual(afterPolling, { cards: 2, readCards: 2, unreadCards: 0, badge: "" });

    const createdMemberInvite = await api(baseUrl, owner, `/api/groups/${groupId}/member-invites`, "POST", { userId: member.user.id });
    const memberInviteNotifications = await api(baseUrl, member, "/api/notifications");
    const memberInviteNotification = memberInviteNotifications.body.notifications.find((item) => item.type === "group_invite" && item.entityId === createdMemberInvite.body.invite.id);
    assert.ok(memberInviteNotification?.unread, "o convite não gerou uma notificação não lida para o destinatário");
    await api(baseUrl, member, `/api/notifications/${memberInviteNotification.id}`, "PATCH");
    await api(baseUrl, member, `/api/member-invites/${createdMemberInvite.body.invite.id}/accept`, "POST");
    const memberNotificationsAfterAccept = await api(baseUrl, member, "/api/notifications");
    assert.ok(memberNotificationsAfterAccept.body.notifications.find((item) => item.id === memberInviteNotification.id)?.readAt, "notificação lida de convite aceito deve continuar disponível no histórico");
    console.log(JSON.stringify({ ok: true, beforeClick, afterIndividualRead, afterMarkAll, afterPolling }));
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  app.exit(1);
});
