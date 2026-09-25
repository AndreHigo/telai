import assert from "node:assert/strict";
import { createGroupRoomReadController } from "../frontend/src/features/groups/room-read-controller.js";

let selectedGroupId = "group-1";
let overview = {
  group: { id: "group-1" },
  rooms: [
    { id: "room-1", kind: "text", slug: "geral", unreadCount: 3 },
    { id: "room-2", kind: "text", slug: "avisos", unreadCount: 1 },
  ],
};
const requests = [];
const controller = createGroupRoomReadController({
  api: async (path) => { requests.push(path); },
  getSelectedGroupId: () => selectedGroupId,
  getGroupOverview: () => overview,
  setGroupOverview: (value) => { overview = value; },
  getUser: () => ({ id: "user-1" }),
});

const room = overview.rooms[0];
const first = controller.markGroupRoomRead(room);
const second = controller.markGroupRoomRead(room);
assert.equal(first, second);
await first;
assert.equal(requests.length, 1);
assert.equal(overview.rooms[0].unreadCount, 0);
assert.equal(controller.messageBelongsToRoom({ roomId: "room-1" }, room), true);
assert.equal(controller.messageBelongsToRoom({ roomId: "room-2" }, room), false);

controller.incrementGroupRoomUnread({ roomId: "room-2", userId: "other-user" });
assert.equal(overview.rooms[1].unreadCount, 2);
controller.incrementGroupRoomUnread({ roomId: "room-2", userId: "user-1" });
assert.equal(overview.rooms[1].unreadCount, 2);

selectedGroupId = "group-2";
await controller.markGroupRoomRead(room);
assert.equal(requests.length, 2);

console.log(JSON.stringify({ ok: true, checks: 10 }));
