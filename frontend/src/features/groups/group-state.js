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
  let current = { ...GROUP_STATE_DEFAULTS, ...initial };
  const subscribers = new Set();

  function getState() {
    return current;
  }

  function setState(next) {
    const patch = typeof next === "function" ? next(current) : next;
    if (!patch || typeof patch !== "object") return current;
    current = { ...current, ...patch };
    for (const subscriber of subscribers) subscriber(current);
    return current;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") return () => {};
    subscribers.add(subscriber);
    subscriber(current);
    return () => subscribers.delete(subscriber);
  }

  function reset() {
    return setState({
      ...GROUP_STATE_DEFAULTS,
      groups: [],
      knownGroupMessageIds: new Set(),
    });
  }

  return { getState, setState, subscribe, reset };
}
