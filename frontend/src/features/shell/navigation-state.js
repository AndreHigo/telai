export const NAVIGATION_STATE_DEFAULTS = Object.freeze({
  view: "home",
  groupsWorkspaceOpen: false,
  groupPickerQuery: "",
  showGlobalSidebar: false,
  globalSidebarCollapsed: false,
  compactViewport: false,
  multistreamOpen: false,
  showMobileChannels: false,
  showMobileMembers: false,
});

export function createNavigationStateStore(initial = {}) {
  let current = { ...NAVIGATION_STATE_DEFAULTS, ...initial };
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
    return setState(NAVIGATION_STATE_DEFAULTS);
  }

  return { getState, setState, subscribe, reset };
}
