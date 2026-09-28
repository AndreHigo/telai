import assert from "node:assert/strict";
import { createVoiceLiveController } from "../frontend/src/features/voice/live-controller.js";

const updates = [];
const controller = createVoiceLiveController({
  getStreams: () => [
    { id: "public-1", visibility: "public", createdBy: "other" },
    { id: "private-1", visibility: "private", voiceRoomId: "room-1", createdBy: "other" },
  ],
  getUserId: () => "local",
  setWatchingStream: (streamId) => updates.push(streamId),
});

controller.watchSelectedRoomLive("public-1");
controller.watchSelectedRoomLive("missing");
controller.watchSelectedRoomLive("private-1");
controller.closeSelectedRoomLive();
assert.deepEqual(updates, ["public-1", "private-1", ""]);
assert.equal(controller.privateLiveForParticipant({ userId: "other" }, "room-1")?.id, "private-1");
assert.equal(controller.privateLiveForParticipant({ userId: "local" }, "room-1"), null);

console.log("voice live controller: ok");
