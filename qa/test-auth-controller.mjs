import assert from "node:assert/strict";
import { createAuthController } from "../frontend/src/features/auth/controller.js";

const state = {
  authMode: "login",
  authBusy: false,
  authError: "old error",
  loginUsername: "andre",
  loginPassword: "senha",
  registerDisplayName: "Andre Higo",
  registerUsername: "andre.higo",
  registerPassword: "senha-forte",
  registerLegalAccepted: true,
};
const requests = [];
const lifecycle = [];
let oauthTarget = "";
const controller = createAuthController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  api: async (path, options) => {
    requests.push([path, JSON.parse(options.body)]);
    return { user: { id: "user-1" } };
  },
  onAuthenticated: async (user) => lifecycle.push(["authenticated", user.id]),
  navigateOAuth: (provider) => { oauthTarget = provider; },
});

let prevented = false;
await controller.submitAuth({ preventDefault: () => { prevented = true; } });
assert.equal(prevented, true);
assert.deepEqual(requests[0], ["/api/auth/login", { username: "andre", password: "senha" }]);
assert.deepEqual(lifecycle, [["authenticated", "user-1"]]);
assert.equal(state.authBusy, false);
assert.equal(state.authError, "");

state.authMode = "register";
await controller.submitAuth();
assert.deepEqual(requests[1], ["/api/auth/register", { displayName: "Andre Higo", username: "andre.higo", password: "senha-forte", termsAccepted: true, privacyAccepted: true }]);

controller.startOAuth("google");
assert.equal(oauthTarget, "google");

const failing = createAuthController({
  getState: () => ({ ...state, authMode: "login" }),
  setState: (next) => Object.assign(state, next),
  api: async () => { throw new Error("credenciais inválidas"); },
  onAuthenticated: async () => {},
  navigateOAuth: () => {},
});
await failing.submitAuth();
assert.equal(state.authError, "credenciais inválidas");
assert.equal(state.authBusy, false);

console.log(JSON.stringify({ ok: true, checks: 10 }));
