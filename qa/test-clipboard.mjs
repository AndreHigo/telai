import assert from "node:assert/strict";
import { copyTextValue } from "../frontend/src/services/clipboard.js";

let desktopValue = "";
await copyTextValue("electron", {
  desktop: { copyText: async (value) => { desktopValue = value; return { ok: true }; } },
  clipboard: { writeText: async () => { throw new Error("não deveria usar o fallback"); } },
});
assert.equal(desktopValue, "electron");

let clipboardValue = "";
await copyTextValue("browser", {
  desktop: { copyText: async () => ({ ok: false }) },
  clipboard: { writeText: async (value) => { clipboardValue = value; } },
});
assert.equal(clipboardValue, "browser");

const appended = [];
let command = "";
const document = {
  body: { appendChild: (element) => appended.push(element) },
  createElement: () => ({
    style: {},
    setAttribute: () => {},
    select: () => {},
    remove: () => { appended.pop(); },
  }),
  execCommand: (value) => { command = value; return true; },
};
await copyTextValue("legacy", { desktop: null, clipboard: null, document });
assert.equal(command, "copy");
assert.equal(appended.length, 0);

await assert.rejects(() => copyTextValue("", { desktop: null, clipboard: null, document: null }));
await assert.rejects(() => copyTextValue("missing", { desktop: null, clipboard: null, document: null }));

console.log(JSON.stringify({ ok: true, checks: 7 }));
