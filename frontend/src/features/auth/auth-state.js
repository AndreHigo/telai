import { createStateStore } from "../../services/state-store.js";

const DEFAULT_AUTH_STATE = {
  providers: { google: false, discord: false },
  authMode: "login",
  authBusy: false,
  authError: "",
  loginUsername: "",
  loginPassword: "",
  registerDisplayName: "",
  registerUsername: "",
  registerPassword: "",
  registerLegalAccepted: false,
};

function createDefaultAuthState() {
  return {
    ...DEFAULT_AUTH_STATE,
    providers: { ...DEFAULT_AUTH_STATE.providers },
  };
}

export function createAuthStateStore(initial = {}) {
  return createStateStore(DEFAULT_AUTH_STATE, initial, createDefaultAuthState);
}
