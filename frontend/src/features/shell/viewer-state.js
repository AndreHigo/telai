import { createStateStore } from "../../services/state-store.js";

export const VIEWER_STATE_DEFAULTS = Object.freeze({
  isViewer: false,
  viewerParentFullscreen: false,
  viewerRoomId: "",
  viewerStreamPath: "",
  viewerStream: null,
});

export function createViewerStateStore(initial = {}) {
  return createStateStore(VIEWER_STATE_DEFAULTS, initial);
}
