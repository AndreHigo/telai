const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { TRAY_STATES, trayIconSvgForState } = require("../electron/tray-icon-design.cjs");

const outputDirectory = path.join(__dirname, "..", "electron", "assets", "tray");

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    await window.loadURL("data:text/html;charset=utf-8,%3C!doctype%20html%3E%3Cmeta%20charset%3Dutf-8%3E%3Cbody%3E%3C%2Fbody%3E");
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const state of TRAY_STATES) {
      const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(trayIconSvgForState(state)).toString("base64")}`;
      const pngDataUrl = await window.webContents.executeJavaScript(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(svgDataUrl)}; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
        const context = canvas.getContext("2d"); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, 32, 32); return canvas.toDataURL("image/png");
      })()`);
      fs.writeFileSync(path.join(outputDirectory, `${state}.png`), Buffer.from(pngDataUrl.split(",")[1], "base64"));
    }
    process.stdout.write(`${JSON.stringify({ generated: TRAY_STATES.length, directory: outputDirectory })}\n`);
  } finally { window.destroy(); app.quit(); }
}

main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); app.exit(1); });
