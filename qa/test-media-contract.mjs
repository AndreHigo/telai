import assert from "node:assert/strict";
import {
  BROADCAST_QUALITY_LABELS,
  BROADCAST_QUALITY_PROFILES,
  MEDIA_MODES,
  hasTurnServer,
  normalizeBroadcastQuality,
  normalizeMediaMode,
  withRelayIceTransportPolicy,
} from "../shared/media-contract.mjs";

assert.deepEqual(Object.keys(BROADCAST_QUALITY_PROFILES), ["economy", "balanced", "high"]);
assert.equal(BROADCAST_QUALITY_PROFILES.balanced.width, 1280);
assert.equal(BROADCAST_QUALITY_PROFILES.high.maxBitrate, 6_000_000);
assert.equal(BROADCAST_QUALITY_LABELS.auto, "Automática");
assert.equal(normalizeBroadcastQuality("high"), "high");
assert.equal(normalizeBroadcastQuality("unknown"), "balanced");
assert.equal(normalizeMediaMode(MEDIA_MODES.RELAY), "relay");
assert.equal(normalizeMediaMode("sfu"), "p2p");
assert.equal(hasTurnServer({ iceServers: [{ urls: "stun:example.test" }, { urls: ["turn:turn.example.test:3478", "stun:other.test"] }] }), true);
assert.equal(hasTurnServer({ iceServers: [{ urls: ["stun:one.test", "stun:two.test"] }] }), false);
assert.deepEqual(withRelayIceTransportPolicy({ iceServers: [] }), { iceServers: [], iceTransportPolicy: "relay" });

console.log(JSON.stringify({ ok: true, modes: Object.values(MEDIA_MODES), qualities: Object.keys(BROADCAST_QUALITY_PROFILES) }));
