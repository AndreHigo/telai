export const CLIENT_POLL_INTERVALS = Object.freeze({
  groupOverview: 15_000,
  streams: 15_000,
  notifications: 30_000,
  directMessages: 8_000,
  maintenance: 30_000,
  maintenanceCountdown: 1_000,
});

function defaultShouldPoll() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function createClientPollingController({
  getState = () => ({}),
  shouldPoll = defaultShouldPoll,
  refreshGroupOverview,
  loadStreams,
  loadNotifications,
  loadDirectConversationMessages,
  loadMaintenance,
  updateMaintenanceCountdown,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  const timers = new Set();

  function start() {
    if (timers.size) return;
    const schedule = (callback, delay) => {
      const timer = setIntervalFn(callback, delay);
      timers.add(timer);
    };
    schedule(() => {
      if (!shouldPoll()) return;
      const state = getState();
      if (state.user && !state.isViewer && state.view === "groups" && state.groupsWorkspaceOpen && state.selectedGroupId) {
        void refreshGroupOverview?.();
      }
    }, CLIENT_POLL_INTERVALS.groupOverview);
    schedule(() => {
      if (!shouldPoll()) return;
      const state = getState();
      if (state.user && !state.isViewer && ["home", "live", "groups"].includes(state.view)) void loadStreams?.();
    }, CLIENT_POLL_INTERVALS.streams);
    schedule(() => {
      if (!shouldPoll()) return;
      const state = getState();
      if (state.user && !state.isViewer && state.view !== "viewer") void loadNotifications?.();
    }, CLIENT_POLL_INTERVALS.notifications);
    schedule(() => {
      if (!shouldPoll()) return;
      const state = getState();
      if (state.user && !state.isViewer && state.view === "direct" && state.directConversationId) {
        void loadDirectConversationMessages?.();
      }
    }, CLIENT_POLL_INTERVALS.directMessages);
    schedule(() => {
      if (shouldPoll()) void loadMaintenance?.();
    }, CLIENT_POLL_INTERVALS.maintenance);
    schedule(() => updateMaintenanceCountdown?.(), CLIENT_POLL_INTERVALS.maintenanceCountdown);
  }

  function stop() {
    for (const timer of timers) clearIntervalFn(timer);
    timers.clear();
  }

  return { start, stop, isRunning: () => timers.size > 0 };
}
