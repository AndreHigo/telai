import assert from "node:assert/strict";
import { createRuntimeLimits } from "../server/config/limits.mjs";

const defaults = createRuntimeLimits({ env: {} });
assert.equal(defaults.apiRateLimitPerMinute, 240);
assert.equal(defaults.apiWriteRateLimitPerMinute, 90);
assert.equal(defaults.websocketActiveConnectionLimit, 20);
assert.equal(defaults.maxAvatarUploadLength, 7 * 1024 * 1024);
assert.ok(defaults.routineClientDiagnosticKinds.has("voice_rtc_quality"));

const configured = createRuntimeLimits({
  env: {
    MIRANTE_API_RATE_LIMIT_PER_MIN: "10",
    MIRANTE_API_WRITE_RATE_LIMIT_PER_MIN: "12",
    MIRANTE_LOGIN_FAILURE_LIMIT: "8",
    MIRANTE_LOGIN_FAILURE_IP_LIMIT: "3",
    MIRANTE_WS_ACTIVE_CONNECTION_LIMIT: "4",
  },
});
assert.equal(configured.apiRateLimitPerMinute, 30, "API rate limit mantém o piso operacional");
assert.equal(configured.apiWriteRateLimitPerMinute, 15, "write rate limit mantém o piso operacional");
assert.equal(configured.loginFailureLimit, 8);
assert.equal(configured.loginFailureIpLimit, 8, "limite por IP não pode ser menor que o limite geral");
assert.equal(configured.websocketActiveConnectionLimit, 4);
assert.notEqual(defaults.apiRate, configured.apiRate, "cada runtime precisa de buckets isolados");

console.log(JSON.stringify({ ok: true, defaultApiRate: defaults.apiRateLimitPerMinute, configuredApiRate: configured.apiRateLimitPerMinute }));
