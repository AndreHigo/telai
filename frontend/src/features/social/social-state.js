import { createStateStore } from "../../services/state-store.js";

function emptySocial() {
  return {
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    following: [],
    blocked: [],
    counts: { friends: 0, incomingRequests: 0, following: 0, blocked: 0 },
  };
}

function createDefaultSocialState() {
  return {
    social: emptySocial(),
    socialSearchQuery: "",
    socialSearchOpen: false,
    socialRequestsOpen: false,
    socialSearchResults: [],
    socialSearchBusy: false,
    socialError: "",
    socialActionId: "",
    socialRefreshInFlight: false,
  };
}

export function createSocialStateStore(initial = {}) {
  return createStateStore(createDefaultSocialState(), initial, createDefaultSocialState);
}
