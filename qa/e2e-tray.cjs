const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, nativeImage } = require("electron");

const root = path.resolve(__dirname, "..");
const { TRAY_STATES, trayStateForStatus } = require(path.join(root, "electron", "tray-icon-design.cjs"));
const files = {
  main: fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8"),
  preload: fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8"),
  app: fs.readFileSync(path.join(root, "frontend", "src", "App.svelte"), "utf8"),
  design: fs.readFileSync(path.join(root, "electron", "tray-icon-design.cjs"), "utf8"),
};

const assertions = [
  ["menu contextual por estado", /function trayContextMenuForStatus\(status = \{\}\)/.test(files.main)],
  ["ação de abrir", files.main.includes('label: "Abrir Telai"')],
  ["ação de reiniciar", files.main.includes('label: "Reiniciar Telai"') && files.main.includes("app.relaunch()") && files.main.includes("function restartApplication")],
  ["ação de microfone", files.main.includes('"toggle-mute"') && files.app.includes('action === "toggle-mute"')],
  ["ação de áudio", files.main.includes('"toggle-deafen"') && files.app.includes('action === "toggle-deafen"')],
  ["verificação de atualizações", files.main.includes("checkForUpdatesInBackground()")],
  ["reconhecimentos", files.main.includes('label: "Reconhecimentos"') && files.main.includes("showTrayAcknowledgements")],
  ["saída explícita", files.main.includes('label: "Sair do Telai"') && files.main.includes("app.quit()")],
  ["ponte IPC da bandeja", files.preload.includes('onTrayAction(callback)') && files.main.includes('"app-tray-action"')],
  ["reconstrução do menu ao mudar estado", files.main.includes("tray.setContextMenu(trayContextMenuForStatus(normalized))")],
  ["ícone Telai transparente por estado", files.main.includes('createFromPath(iconPath)') && files.design.includes('const mark = safeState === "sharing"') && files.design.includes('safeState === "deafened"') && files.main.includes('const dynamicIcon = trayIconForStatus({})')],
  ["estado logado fora de sala", files.app.includes("connected: Boolean(user)") && files.main.includes('if (status.connected && !status.live && !status.voice)')],
  ["diagnóstico de atualização", files.main.includes('"tray_status_updated"') && files.main.includes('"tray_status_update_failed"')],
  ["limpeza do listener", files.app.includes("desktopTrayUnsubscribe?.()")],
  ["preferência de aceleração gráfica", files.main.includes("app.disableHardwareAcceleration()") && files.main.includes('app-get-hardware-acceleration') && files.preload.includes('setHardwareAcceleration(mode)') && files.app.includes("Aceleração gráfica")],
];

async function main() {
  await app.whenReady();
  const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  const statusCases = [
    ["idle", {}],
    ["connected", { connected: true }],
    ["live", { live: true }],
    ["camera", { live: true, camera: true }],
    ["sharing", { sharing: true }],
    ["voice", { voice: true }],
    ["muted", { voice: true, muted: true }],
    ["deafened", { voice: true, deafened: true }],
  ];
  for (const [expected, status] of statusCases) {
    if (trayStateForStatus(status) !== expected) failures.push(`estado ${expected} não mapeou para o ícone correto`);
  }
  const signatures = new Set();
  for (const state of TRAY_STATES) {
    const iconPath = path.join(root, "electron", "assets", "tray", `${state}.png`);
    const icon = nativeImage.createFromPath(iconPath);
    const size = icon.getSize();
    if (icon.isEmpty() || size.width !== 32 || size.height !== 32) failures.push(`ícone ${state} vazio ou tamanho inválido: ${JSON.stringify(size)}`);
    signatures.add(crypto.createHash("sha256").update(icon.toPNG()).digest("hex"));
  }
  if (signatures.size !== TRAY_STATES.length) failures.push("dois estados da bandeja geraram o mesmo PNG");
  if (failures.length) {
    console.error(JSON.stringify({ ok: false, failed: failures }));
    app.exit(1);
    return;
  }
  console.log(JSON.stringify({ ok: true, checks: assertions.length + statusCases.length + TRAY_STATES.length, renderedIcons: TRAY_STATES.length }));
  app.quit();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }));
  app.exit(1);
});
