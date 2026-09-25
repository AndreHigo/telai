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

console.log(JSON.stringify({ ok: true, viewerQuery: true, friendlyPath: true, loginCanonicalization: true }));
