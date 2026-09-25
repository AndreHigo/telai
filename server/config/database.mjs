export function createDatabaseConfig({ env = process.env } = {}) {
  const driver = String(env.TELAI_DATABASE_DRIVER || "sqlite").trim().toLowerCase();
  if (!['sqlite', 'postgres'].includes(driver)) throw new Error(`Unsupported database driver: ${driver}`);

  const poolMax = Math.max(1, Math.min(50, Number(env.TELAI_DATABASE_POOL_MAX || 10)));
  const connectionString = String(env.DATABASE_URL || "").trim();
  const ssl = String(env.DATABASE_SSL || "").trim().toLowerCase() === "require";

  return Object.freeze({ driver, connectionString, poolMax, ssl });
}
