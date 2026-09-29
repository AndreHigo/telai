import assert from "node:assert/strict";
import { createSfuConfig, publicSfuConfig } from "../server/media/sfu-config.mjs";

const disabled = createSfuConfig({ env: {} });
assert.equal(disabled.enabled, false);
assert.equal(disabled.provider, "disabled");
assert.equal(publicSfuConfig(disabled).endpoint, "");

assert.throws(
  () => createSfuConfig({ env: { TELAI_SFU_ENABLED: "true", TELAI_SFU_PROVIDER: "livekit" } }),
  /sfu-endpoint-required/,
);

const livekit = createSfuConfig({
  env: {
    TELAI_SFU_ENABLED: "true",
    TELAI_SFU_PROVIDER: "livekit",
    TELAI_SFU_ENDPOINT: "wss://rtc.example.com/",
    TELAI_SFU_API_KEY: "key",
    TELAI_SFU_API_SECRET: "secret",
    TELAI_SFU_ROOM_PREFIX: "telai public/",
  },
});
assert.equal(livekit.enabled, true);
assert.equal(livekit.endpoint, "wss://rtc.example.com");
assert.equal(livekit.roomPrefix, "telai-public-");
assert.deepEqual(publicSfuConfig(livekit), {
  enabled: true,
  provider: "livekit",
  endpoint: "wss://rtc.example.com",
  roomPrefix: "telai-public-",
});
assert.equal("apiSecret" in publicSfuConfig(livekit), false);

console.log(JSON.stringify({ ok: true, disabledByDefault: true, failClosed: true, secretRedacted: true }));
