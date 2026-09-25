import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = [
  "test-postgres-migration-concurrency.mjs",
  "validate-postgres-migration.mjs",
  "test-postgres-repositories.mjs",
  "test-postgres-import.mjs",
  "test-postgres-maintenance.cjs",
  "run-api-postgres.cjs",
];
const qaDirectory = path.dirname(fileURLToPath(import.meta.url));

for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(qaDirectory, script)], {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(JSON.stringify({ ok: true, sequential: true, scripts }));
