import { createStateStore } from "../../services/state-store.js";

function createDefaultBroadcastState() {
  return {
    broadcastState: "idle",
    broadcastError: "",
    broadcastTitle: "",
    broadcastInvite: "",
    broadcastRoomId: "",
    broadcastStreamId: "",
    broadcastStream: null,
    broadcastCameraDeviceId: "",
    broadcastCameraPosition: "bottom-right",
    broadcastCameraEnabled: false,
    broadcastMicrophoneEnabled: true,
    broadcastSourceType: "screen",
    broadcastDisplaySurface: null,
    broadcastSelectedSourceName: "",
    broadcastSelectionKind: "screen",
    broadcastVisibility: "private",
    showBroadcastVisibilityDialog: false,
    showPublicBroadcastSetup: false,
    showPublicBroadcastReview: false,
    publicBroadcastTitle: "",
    publicBroadcastSourceKind: "screen",
    publicBroadcastMicrophoneEnabled: false,
    publicBroadcastCameraEnabled: false,
    publicBroadcastCameraDeviceId: "",
    publicBroadcastQuality: "balanced",
    publicBroadcastReviewSelection: null,
    pendingBroadcastContext: null,
    pendingBroadcastSourceType: "screen",
  };
}

export const BROADCAST_STATE_DEFAULTS = Object.freeze(createDefaultBroadcastState());

export function createBroadcastStateStore(initial = {}) {
  return createStateStore(createDefaultBroadcastState(), initial, createDefaultBroadcastState);
}
