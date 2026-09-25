const assert = require("node:assert/strict");
const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-web-audit-${process.pid}-${Date.now()}.sqlite`);
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

async function register(baseUrl, username) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName: "QA Web Audit", password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  const cookie = result.response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0];
  assert.match(cookie || "", /^mirante_session=/);
  return cookie;
}

async function evaluate(window, expression) {
  if (window.isDestroyed()) throw new Error("janela de auditoria foi encerrada");
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

async function inspectLayout(window, label, width, height) {
  window.setSize(width, height);
  await sleep(500);
  const result = await evaluate(window, () => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 5)
      .map((element) => ({ tag: element.tagName, className: String(element.className || "").slice(0, 100), right: Math.round(element.getBoundingClientRect().right), left: Math.round(element.getBoundingClientRect().left) }));
    const groupPanel = document.querySelector(".groups-view .discord-layout");
    const groupPanelBottom = groupPanel ? Math.round(groupPanel.getBoundingClientRect().bottom) : null;
    return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, horizontalOverflow: overflow > 1, groupsPanelClipped: groupPanelBottom !== null && groupPanelBottom > window.innerHeight + 1, groupPanelBottom, offenders };
  });
  return { label, width, height, ...result };
}

async function clickNav(window, label) {
  const target = JSON.stringify(label);
  const clicked = await evaluate(window, `() => {
    const button = [...document.querySelectorAll(".global-sidebar-item, .nav-card")].find((candidate) => candidate.textContent.includes(${target}));
    if (!button) return false;
    button.click();
    return true;
  }`);
  if (!clicked) throw new Error(`navegação não encontrada: ${label}`);
  await sleep(350);
}

async function clickSettingsCategory(window, label) {
  const target = JSON.stringify(label);
  const result = await evaluate(window, `() => {
    const buttons = [...document.querySelectorAll(".settings-category-nav button")];
    const button = buttons.find((candidate) => candidate.textContent.includes(${target}));
    if (!button || button.disabled) return { clicked: false, buttons: buttons.map((candidate) => ({ text: candidate.textContent.trim(), disabled: candidate.disabled })) };
    button.click();
    return { clicked: true, buttons: [] };
  }`);
  if (!result.clicked) throw new Error(`categoria de configuração não encontrada: ${label}; disponíveis: ${JSON.stringify(result.buttons)}`);
  await sleep(250);
}

async function inspectSettingsCategoryNav(window, label) {
  return {
    label,
    ...(await evaluate(window, () => {
      const nav = document.querySelector(".settings-category-nav");
      const buttons = [...document.querySelectorAll(".settings-category-nav button")];
      const navRect = nav?.getBoundingClientRect();
      const rects = buttons.map((button) => button.getBoundingClientRect());
      return {
        navHeight: navRect ? Math.round(navRect.height) : null,
        buttonHeights: rects.map((rect) => Math.round(rect.height)),
      };
    })),
  };
}

async function inspectSettingsCategoryContent(window, label) {
  return {
    label,
    ...(await evaluate(window, () => {
      const page = document.querySelector(".settings-page");
      const channel = document.querySelector(".channel-profile-card");
      const voice = document.querySelector(".voice-settings-card");
      const notifications = document.querySelector(".notification-preferences-card");
      const settingsLayout = document.querySelector(".settings-layout");
      const heading = document.querySelector(".settings-heading");
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      return {
        pageClass: page?.className || "",
        headingVisible: visible(heading),
        settingsLayoutVisible: visible(settingsLayout),
        channelVisible: visible(channel),
        voiceVisible: visible(voice),
        notificationsVisible: visible(notifications),
      };
    })),
  };
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookie = await register(baseUrl, `qa_web_audit_${Date.now()}${process.pid}`.slice(0, 32));
  const directTargetCookie = await register(baseUrl, `qa_web_direct_target_${Date.now()}${process.pid}`.slice(0, 32));
  const directTargetSession = await request(baseUrl, "/api/auth/session", { headers: { cookie: directTargetCookie } });
  await request(baseUrl, "/api/direct/conversations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ userId: directTargetSession.body.user.id }),
  });
  await request(baseUrl, "/api/groups", { method: "POST", headers: { cookie }, body: JSON.stringify({ name: "QA Layout Group" }) });
  const consoleErrors = [];
  const failedRequests = [];
  let authenticatedWindow;
  let desktopViewerWindow;
  let anonymousWindow;
  const layouts = [];
  const desktopIpcHandlers = new Map([
    ["app-get-version", () => "0.2.57"],
    ["app-get-launch-at-login", () => false],
    ["app-get-hardware-acceleration", () => ({ ok: true, mode: "auto", enabled: true, restartRequired: false })],
    ["app-check-for-updates", () => ({ status: "idle" })],
  ]);
  for (const [channel, handler] of desktopIpcHandlers) ipcMain.handle(channel, handler);
  try {
    await session.defaultSession.cookies.set({ url: baseUrl, name: "mirante_session", value: cookie.slice("mirante_session=".length), httpOnly: true, sameSite: "lax" });
    authenticatedWindow = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    authenticatedWindow.webContents.on("console-message", (_event, level, message) => { if (level >= 2) consoleErrors.push(message); });
    authenticatedWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => failedRequests.push({ errorCode, errorDescription, validatedURL }));
    await authenticatedWindow.loadURL(`${baseUrl}/svelte/`);
    await waitFor("painel autenticado", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".user-menu-chip"))));
    const headerControlOrder = await evaluate(authenticatedWindow, () => {
      const actions = document.querySelector(".topbar-actions");
      const notification = actions?.querySelector(".notification-button");
      const account = actions?.querySelector(".user-menu-chip");
      const notificationRect = notification?.getBoundingClientRect();
      const accountRect = account?.getBoundingClientRect();
      return {
        notificationPresent: Boolean(notification),
        accountPresent: Boolean(account),
        notificationHeight: Math.round(notificationRect?.height || 0),
        accountHeight: Math.round(accountRect?.height || 0),
      };
    });
    assert.ok(headerControlOrder.notificationPresent && headerControlOrder.accountPresent, `controles do cabeçalho ausentes: ${JSON.stringify(headerControlOrder)}`);
    assert.ok(Math.abs(headerControlOrder.notificationHeight - headerControlOrder.accountHeight) <= 1, `botão de notificações ficou com altura diferente do menu da conta: ${JSON.stringify(headerControlOrder)}`);
    await evaluate(authenticatedWindow, () => localStorage.setItem("mirante-voice-reconnect", JSON.stringify({ groupId: "qa-reconnect-group", voiceRoomId: "qa-reconnect-room", groupName: "Grupo de reconexão", roomName: "Sala de teste", savedAt: Date.now() })));
    await authenticatedWindow.reload();
    await waitFor("aviso de reconexão após reinício", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".voice-reconnect-banner"))));
    assert.match(await evaluate(authenticatedWindow, () => document.querySelector(".voice-reconnect-banner")?.textContent || ""), /Grupo de reconexão/);
    await evaluate(authenticatedWindow, () => [...document.querySelectorAll(".voice-reconnect-actions button")].find((button) => button.textContent.includes("Descartar"))?.click());
    await waitFor("descarte da sessão de reconexão", () => evaluate(authenticatedWindow, () => !document.querySelector(".voice-reconnect-banner") && !localStorage.getItem("mirante-voice-reconnect")));
    for (const [width, height] of [[1440, 900], [1200, 800], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Início", width, height));

    await clickNav(authenticatedWindow, "Meus grupos");
    await waitFor("pré-tela de grupos", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".groups-picker-page"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Meus grupos", width, height));
    const openedGroup = await evaluate(authenticatedWindow, () => {
      const card = document.querySelector(".groups-picker-card");
      if (!card || card.disabled) return false;
      card.click();
      return true;
    });
    if (!openedGroup) throw new Error("nenhum grupo disponível na pré-tela de grupos");
    await waitFor("workspace de grupos", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".discord-layout"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Grupo aberto", width, height));
    await clickNav(authenticatedWindow, "Ao vivo");
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Ao vivo", width, height));
    await clickNav(authenticatedWindow, "Seguindo");
    await waitFor("central de canais seguidos", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector("#following-title"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Seguindo", width, height));
    await clickNav(authenticatedWindow, "Amigos");
    await waitFor("central de amigos", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".social-page"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Amigos", width, height));
    await clickNav(authenticatedWindow, "Mensagens");
    await waitFor("central de mensagens", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".direct-messages-page"))));
    await waitFor("conversa privada na lista", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".direct-conversation-item"))));
    await evaluate(authenticatedWindow, () => document.querySelector(".direct-conversation-item")?.click());
    await waitFor("campo da conversa privada", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".direct-composer textarea"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Mensagens", width, height));
    await clickNav(authenticatedWindow, "Início");
    await evaluate(authenticatedWindow, () => { const button = document.querySelector(".notification-button"); if (button) button.click(); });
    await waitFor("central de notificações", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".notifications-page"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Notificações", width, height));

    await evaluate(authenticatedWindow, () => document.querySelector(".user-menu-chip")?.click());
    await evaluate(authenticatedWindow, () => [...document.querySelectorAll(".account-menu-item")].find((button) => button.textContent.includes("Configurações"))?.click());
    await waitFor("configurações da conta", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".settings-page"))));
    authenticatedWindow.setSize(1440, 900);
    await waitFor("viewport desktop das configurações", () => evaluate(authenticatedWindow, () => window.innerWidth >= 1200));
    const settingsCategoryLayouts = [];
    const settingsCategoryContents = [];
    for (const category of ["Perfil", "Canal", "Áudio e voz", "Notificações"]) {
      await clickSettingsCategory(authenticatedWindow, category);
      settingsCategoryLayouts.push(await inspectSettingsCategoryNav(authenticatedWindow, category));
      settingsCategoryContents.push(await inspectSettingsCategoryContent(authenticatedWindow, category));
    }
    const settingsNavHeights = settingsCategoryLayouts.map((item) => item.navHeight).filter((height) => height !== null);
    assert.ok(settingsNavHeights.length === settingsCategoryLayouts.length && Math.max(...settingsNavHeights) - Math.min(...settingsNavHeights) <= 1, `navegação de configurações mudou de altura entre categorias: ${JSON.stringify(settingsCategoryLayouts)}`);
    assert.ok(settingsCategoryLayouts.every((item) => item.buttonHeights.length > 0 && new Set(item.buttonHeights).size === 1), `cartões da navegação de configurações ficaram desalinhados: ${JSON.stringify(settingsCategoryLayouts)}`);
    const profileContent = settingsCategoryContents.find((item) => item.label === "Perfil");
    assert.ok(profileContent?.headingVisible && profileContent.settingsLayoutVisible && !profileContent.channelVisible && !profileContent.voiceVisible && !profileContent.notificationsVisible, `conteúdo da categoria Perfil não apareceu corretamente: ${JSON.stringify(profileContent)}`);
    await clickSettingsCategory(authenticatedWindow, "Perfil");
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Configurações · Perfil", width, height));
    const expectedSettingsPanels = {
      Canal: "channel",
      "Áudio e voz": "voice",
      Notificações: "notifications",
    };
    for (const [label, panel] of Object.entries(expectedSettingsPanels)) {
      const content = settingsCategoryContents.find((item) => item.label === label);
      assert.ok(content?.headingVisible && content[`${panel}Visible`] && ["channel", "voice", "notifications"].filter((item) => item !== panel).every((item) => !content[`${item}Visible`]), `conteúdo da categoria ${label} não apareceu corretamente: ${JSON.stringify(content)}`);
    }
    await clickSettingsCategory(authenticatedWindow, "Áudio e voz");
    await waitFor("controles de volume de áudio", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".voice-settings-card .voice-volume-grid"))));
    const audioVolumeControls = await evaluate(authenticatedWindow, () => ({
      microphone: Boolean(document.querySelector(".voice-volume-grid input[aria-label='Volume do microfone']")),
      output: Boolean(document.querySelector(".voice-volume-grid input[aria-label='Volume do fone']")),
    }));
    if (!audioVolumeControls.microphone || !audioVolumeControls.output) throw new Error("controles de volume não ficaram disponíveis");
    await evaluate(authenticatedWindow, () => {
      const input = document.querySelector(".voice-volume-grid input[aria-label='Volume do microfone']");
      input.value = "37";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await evaluate(authenticatedWindow, () => localStorage.getItem("mirante-voice-microphone-volume")), "0.37", "volume do microfone não persistiu");
    await evaluate(authenticatedWindow, () => {
      const input = document.querySelector(".voice-volume-grid input[aria-label='Volume do fone']");
      input.value = "63";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await evaluate(authenticatedWindow, () => localStorage.getItem("mirante-voice-output-volume")), "0.63", "volume do fone não persistiu");
    await waitFor("controles de entrada personalizados", () => evaluate(authenticatedWindow, `() => {
      const custom = document.querySelector(".voice-profile-option input[value='custom']");
      custom?.click();
      return Boolean(document.querySelector(".voice-custom-sensitivity"));
    }`));
    const customSensitivityControls = await evaluate(authenticatedWindow, () => ({
      automatic: Boolean(document.querySelector(".voice-custom-sensitivity input[aria-label='Ajustar automaticamente a sensibilidade de fala']")),
      manual: Boolean(document.querySelector(".voice-sensitivity-range")),
    }));
    if (!customSensitivityControls.automatic) throw new Error("controle automático de sensibilidade não ficou disponível");
    await evaluate(authenticatedWindow, () => document.querySelector(".voice-custom-sensitivity .permission-toggle input")?.click());
    await waitFor("sensibilidade manual", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".voice-sensitivity-range input"))));
    await evaluate(authenticatedWindow, () => {
      const input = document.querySelector(".voice-sensitivity-range input");
      input.value = "68";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(await evaluate(authenticatedWindow, () => localStorage.getItem("mirante-voice-sensitivity")), "68", "sensibilidade manual não persistiu");
    for (const [width, height] of [[1024, 768], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Áudio e voz", width, height));
    const viewerStream = await request(baseUrl, "/api/streams", {
      method: "POST", headers: { cookie },
      body: JSON.stringify({ roomName: `qa-viewer-${Date.now()}`.slice(0, 40), title: "QA Viewer Offline" }),
    });
    await authenticatedWindow.loadURL(`${baseUrl}${viewerStream.body.stream.publicPath}`);
    await waitFor("visualizador de transmissão", () => evaluate(authenticatedWindow, () => Boolean(document.querySelector(".viewer-page"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650], [640, 800]]) layouts.push(await inspectLayout(authenticatedWindow, "Assistir transmissão", width, height));

    desktopViewerWindow = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { preload: path.join(rootDir, "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    desktopViewerWindow.webContents.on("console-message", (_event, level, message) => { if (level >= 2) consoleErrors.push(message); });
    desktopViewerWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => failedRequests.push({ errorCode, errorDescription, validatedURL }));
    await desktopViewerWindow.loadURL(`${baseUrl}${viewerStream.body.stream.publicPath}`);
    await waitFor("visualizador Electron", () => evaluate(desktopViewerWindow, () => Boolean(document.querySelector(".viewer-page") && document.querySelector(".mirante-shell.desktop-app"))));
    for (const [width, height] of [[1440, 900], [1024, 768], [900, 650]]) layouts.push(await inspectLayout(desktopViewerWindow, "Assistir transmissão · Electron", width, height));

    assert.ok(await evaluate(authenticatedWindow, () => Boolean(document.querySelector(".viewer-audience-count-heading"))), "contador de espectadores não apareceu no cabeçalho do visualizador");
    anonymousWindow = new BrowserWindow({ show: false, width: 640, height: 800, webPreferences: { partition: "persist:telai-web-audit-anonymous", contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await anonymousWindow.loadURL(`${baseUrl}/login`);
    await waitFor("tela de login", () => evaluate(anonymousWindow, () => Boolean(document.querySelector(".auth-form"))));
    const anonymousLayout = await inspectLayout(anonymousWindow, "Login", 640, 800);
    layouts.push(anonymousLayout);
    assert.ok(layouts.every((item) => !item.horizontalOverflow), `overflow horizontal encontrado: ${JSON.stringify(layouts.filter((item) => item.horizontalOverflow))}`);
    assert.ok(layouts.filter((item) => ["Assistir transmissão", "Assistir transmissão · Electron"].includes(item.label)).every((item) => item.offenders.length === 0), `elementos do visualizador fora da viewport: ${JSON.stringify(layouts.filter((item) => ["Assistir transmissão", "Assistir transmissão · Electron"].includes(item.label) && item.offenders.length > 0))}`);
    assert.ok(layouts.filter((item) => item.label === "Meus grupos").every((item) => !item.groupsPanelClipped), `painel de grupos cortado: ${JSON.stringify(layouts.filter((item) => item.groupsPanelClipped))}`);
    assert.equal(failedRequests.length, 0, `falhas de carregamento: ${JSON.stringify(failedRequests)}`);
    console.log(JSON.stringify({ ok: true, layouts, consoleErrors, failedRequests }));
  } finally {
    if (authenticatedWindow && !authenticatedWindow.isDestroyed()) authenticatedWindow.destroy();
    if (desktopViewerWindow && !desktopViewerWindow.isDestroyed()) desktopViewerWindow.destroy();
    if (anonymousWindow && !anonymousWindow.isDestroyed()) anonymousWindow.destroy();
    for (const channel of desktopIpcHandlers.keys()) ipcMain.removeHandler(channel);
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); app.exit(1); });
