export const GROUP_STATE_DEFAULTS = Object.freeze({
  groups: [],
  selectedGroupId: null,
  groupOverview: null,
  knownGroupMessageIds: new Set(),
  selectedRoomId: null,
  watchingGroupLiveStreamId: "",
  groupLoading: false,
  groupLoadSequence: 0,
  groupOverviewRetryAt: 0,
  groupOverviewRefreshInFlight: false,
  groupPresenceRefreshInFlight: false,
});

export function createGroupStateStore(initial = {}) {
  return createStateStore(GROUP_STATE_DEFAULTS, initial, () => ({
      ...GROUP_STATE_DEFAULTS,
      groups: [],
      knownGroupMessageIds: new Set(),
    }));
}
import { createStateStore } from "../../services/state-store.js";
