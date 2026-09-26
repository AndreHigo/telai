import { createStateStore } from "../../services/state-store.js";

function createDefaultLiveState() {
  return {
    streams: [],
    followingOnly: false,
    liveNotificationScope: "related",
    liveNotificationScopes: ["related"],
    selectedStreams: new Set(),
    streamsRefreshInFlight: false,
  };
}

export const LIVE_STATE_DEFAULTS = Object.freeze(createDefaultLiveState());

export function createLiveStateStore(initial = {}) {
  return createStateStore(createDefaultLiveState(), initial, createDefaultLiveState);
}
