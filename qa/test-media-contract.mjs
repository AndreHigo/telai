import assert from "node:assert/strict";
import {
  BROADCAST_QUALITY_LABELS,
  BROADCAST_QUALITY_PROFILES,
  MEDIA_MODES,
  normalizeBroadcastQuality,
  normalizeMediaMode,
} from "../shared/media-contract.mjs";

assert.deepEqual(Object.keys(BROADCAST_QUALITY_PROFILES), ["economy", "balanced", "high"]);
assert.equal(BROADCAST_QUALITY_PROFILES.balanced.width, 1280);
assert.equal(BROADCAST_QUALITY_PROFILES.high.maxBitrate, 6_000_000);
assert.equal(BROADCAST_QUALITY_LABELS.auto, "Automática");
assert.equal(normalizeBroadcastQuality("high"), "high");
assert.equal(normalizeBroadcastQuality("unknown"), "balanced");
assert.equal(normalizeMediaMode(MEDIA_MODES.RELAY), "relay");
assert.equal(normalizeMediaMode("sfu"), "p2p");

console.log(JSON.stringify({ ok: true, modes: Object.values(MEDIA_MODES), qualities: Object.keys(BROADCAST_QUALITY_PROFILES) }));
