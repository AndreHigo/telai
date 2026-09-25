import assert from "node:assert/strict";
import { createViewportController } from "../frontend/src/features/shell/viewport-controller.js";

let matches = false;
let compactViewport = false;
let showGlobalSidebar = true;
const controller = createViewportController({
  matchMedia: () => ({ matches }),
  getCompactViewport: () => compactViewport,
  setState: (next) => {
    if ("compactViewport" in next) compactViewport = next.compactViewport;
    if ("showGlobalSidebar" in next) showGlobalSidebar = next.showGlobalSidebar;
  },
});

assert.equal(controller.sync(), false);
matches = true;
assert.equal(controller.sync(), true);
assert.equal(compactViewport, true);
assert.equal(showGlobalSidebar, true);
assert.equal(controller.sync(), false);
matches = false;
assert.equal(controller.sync(), true);
assert.equal(compactViewport, false);
assert.equal(showGlobalSidebar, false);

console.log(JSON.stringify({ ok: true, checks: 8 }));
