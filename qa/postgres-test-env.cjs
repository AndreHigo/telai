const fs = require("node:fs");
const path = require("node:path");

function loadPostgresTestEnv() {
  const envPath = path.resolve(__dirname, "..", "deploy", ".env.postgres");
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
  return true;
}

module.exports = { loadPostgresTestEnv };
