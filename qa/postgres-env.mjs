import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDirectory = path.resolve(qaDirectory, "..");

function parseEnvLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line || line.startsWith("#")) return null;
  const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
  const separator = normalized.indexOf("=");
  if (separator < 1) return null;
  const key = normalized.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = normalized.slice(separator + 1).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export function loadEnvFile(filePath, { env = process.env, required = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (required) throw new Error(`Arquivo ${filePath} não encontrado.`);
    return false;
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(rawLine);
    if (!parsed || Object.hasOwn(env, parsed.key)) continue;
    env[parsed.key] = parsed.value;
  }
  return true;
}

export function loadPostgresEnv({ rootDirectory = defaultRootDirectory, env = process.env, required = false } = {}) {
  return loadEnvFile(path.join(rootDirectory, "deploy", ".env.postgres"), { env, required });
}

