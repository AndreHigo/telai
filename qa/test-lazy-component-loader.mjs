import assert from "node:assert/strict";
import { createLazyComponentLoader } from "../frontend/src/services/lazy-component-loader.js";

let imports = 0;
let assigned = null;
const errors = [];
const loader = createLazyComponentLoader({
  importer: async () => {
    imports += 1;
    await Promise.resolve();
    return { default: { name: "Workspace" } };
  },
  assign: (component) => { assigned = component; },
  onError: (error, kind) => errors.push({ error, kind }),
  errorKind: "workspace_load_error",
});

const first = loader.load();
const second = loader.load();
assert.strictEqual(first, second);
assert.deepEqual(await first, { name: "Workspace" });
assert.equal(imports, 1);
assert.deepEqual(assigned, { name: "Workspace" });
assert.equal(errors.length, 0);

let failedImports = 0;
let failure = null;
const failedLoader = createLazyComponentLoader({
  importer: async () => {
    failedImports += 1;
    throw new Error("import failed");
  },
  assign: () => { throw new Error("não deveria atribuir falha"); },
  onError: (error, kind) => { failure = { message: error.message, kind }; },
});
assert.equal(await failedLoader.load(), null);
assert.equal(failedImports, 1);
assert.deepEqual(failure, { message: "import failed", kind: "lazy_component_load_error" });

console.log(JSON.stringify({ ok: true, checks: 8 }));
