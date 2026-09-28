import assert from "node:assert/strict";
import { createRouteController } from "../frontend/src/features/shell/route-controller.js";

function fakeWindow(href) {
  const calls = [];
  const url = new URL(href);
  return {
    location: url,
    history: {
      replaceState(_state, _title, nextPath) {
        calls.push(nextPath);
        const next = new URL(nextPath, url.origin);
        this.lastPath = nextPath;
        url.href = next.href;
      },
    },
    calls,
  };
}

const viewerWindow = fakeWindow("https://telai.test/?mode=viewer&room=room-1&invite=invite-1&group=group-1&auth_error=oauth-failed");
const viewerState = { isViewer: false };
const viewerController = createRouteController({
  windowObject: viewerWindow,
  getState: () => viewerState,
  setState: (next) => Object.assign(viewerState, next),
});
viewerController.detectViewerRoute();
assert.deepEqual(viewerState, {
  isViewer: true,
  pendingInviteToken: "invite-1",
  pendingGroupRouteId: "group-1",
  pendingRoomRouteId: "room-1",
  authError: "Não foi possível concluir o acesso externo.",
  viewerRoomId: "room-1",
  viewerStreamPath: "",
});
assert.equal(viewerWindow.calls.at(-1), "/?mode=viewer&room=room-1&invite=invite-1&group=group-1");

const friendlyWindow = fakeWindow("https://telai.test/comunidade/canal");
const friendlyState = { isViewer: false };
createRouteController({
  windowObject: friendlyWindow,
  getState: () => friendlyState,
  setState: (next) => Object.assign(friendlyState, next),
}).detectViewerRoute();
assert.equal(friendlyState.isViewer, true);
assert.equal(friendlyState.viewerStreamPath, "/comunidade/canal");

const loginWindow = fakeWindow("https://telai.test/login?from=invite");
const loginState = { isViewer: false };
const loginController = createRouteController({
  windowObject: loginWindow,
  getState: () => loginState,
  setState: (next) => Object.assign(loginState, next),
});
loginController.canonicalizeAuthenticatedRoute();
assert.equal(loginWindow.calls.at(-1), "/?from=invite");

const pendingState = {
  user: { id: "user-1" },
  isViewer: false,
  pendingGroupRouteId: "group-2",
  pendingRoomRouteId: "room-2",
  selectedGroupId: "group-1",
  groupOverview: { group: { id: "group-1" } },
  rooms: [{ id: "room-2", kind: "text" }],
};
const pendingCalls = [];
const pendingController = createRouteController({
  windowObject: fakeWindow("https://telai.test/"),
  getState: () => pendingState,
  setState: (next) => Object.assign(pendingState, next),
  loadGroup: async (groupId) => {
    pendingCalls.push(["load", groupId]);
    pendingState.selectedGroupId = groupId;
    pendingState.groupOverview = { group: { id: groupId } };
  },
  setGroupState: (next) => Object.assign(pendingState, next),
  setGroupsView: () => pendingCalls.push(["view"]),
});
await pendingController.openPendingChannelRoute();
assert.deepEqual(pendingCalls, [["load", "group-2"], ["view"]]);
assert.equal(pendingState.selectedRoomId, "room-2");
assert.equal(pendingState.pendingGroupRouteId, "");
assert.equal(pendingState.pendingRoomRouteId, "");

const popstateState = { isViewer: true, broadcastState: "live", viewerRoomId: "old-room", viewerStreamPath: "/old", viewerStream: { id: "old" } };
const popstateCalls = [];
const popstateController = createRouteController({
  windowObject: fakeWindow("https://telai.test/"),
  getState: () => popstateState,
  setState: (next) => Object.assign(popstateState, next),
  setViewerState: (next) => Object.assign(popstateState, next),
  setNavigationView: (view) => popstateCalls.push(view),
});
popstateController.handleBrowserPopState();
assert.deepEqual(popstateCalls, ["broadcast"]);

console.log(JSON.stringify({ ok: true, viewerQuery: true, friendlyPath: true, loginCanonicalization: true, pendingChannelRoute: true, browserPopState: true }));
