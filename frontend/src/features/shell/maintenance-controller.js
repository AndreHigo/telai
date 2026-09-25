import { createStateStore } from "../../services/state-store.js";

export const MAINTENANCE_STATE_DEFAULTS = Object.freeze({
  notice: null,
  remainingSeconds: 0,
  reloadKey: "",
});

export function createMaintenanceController({
  fetchImpl = globalThis.fetch,
  storage = globalThis.sessionStorage,
  now = () => Date.now(),
  scheduleReload = (callback) => globalThis.setTimeout(callback, 500),
  reload = () => globalThis.location.reload(),
} = {}) {
  const state = createStateStore(MAINTENANCE_STATE_DEFAULTS);
  let refreshInFlight = false;

  function readStorage(key) {
    try { return storage?.getItem(key) === "1"; } catch { return false; }
  }

  function writeStorage(key) {
    try { storage?.setItem(key, "1"); } catch {}
  }

  function clearNotice({ clearReloadKey = false } = {}) {
    state.setState({
      notice: null,
      remainingSeconds: 0,
      ...(clearReloadKey ? { reloadKey: "" } : {}),
    });
  }

  function wasReloaded(id) {
    if (!id) return false;
    return readStorage(`telai-maintenance-reloaded:${id}`);
  }

  function updateCountdown() {
    const current = state.getState();
    const notice = current.notice;
    if (!notice) {
      if (current.remainingSeconds !== 0) state.setState({ remainingSeconds: 0 });
      return state.getState();
    }

    const startsAt = Date.parse(notice.startsAt);
    if (!Number.isFinite(startsAt)) {
      clearNotice();
      return state.getState();
    }
    if (wasReloaded(notice.id) && startsAt <= now()) {
      clearNotice();
      return state.getState();
    }

    const remainingSeconds = Math.max(0, Math.ceil((startsAt - now()) / 1000));
    state.setState({ remainingSeconds });
    if (remainingSeconds > 0 || state.getState().reloadKey === notice.id) return state.getState();

    const storageKey = `telai-maintenance-reloaded:${notice.id}`;
    if (readStorage(storageKey)) {
      clearNotice();
      state.setState({ reloadKey: notice.id });
      return state.getState();
    }

    writeStorage(storageKey);
    state.setState({ reloadKey: notice.id });
    scheduleReload(reload);
    return state.getState();
  }

  async function load() {
    if (refreshInFlight) return state.getState();
    refreshInFlight = true;
    try {
      const response = await fetchImpl("/api/maintenance", { cache: "no-store" });
      if (!response.ok) {
        clearNotice();
        return state.getState();
      }
      const body = await response.json().catch(() => ({}));
      const nextNotice = body.notice || null;
      const visibleNotice = nextNotice && wasReloaded(nextNotice.id) && Date.parse(nextNotice.startsAt) <= now()
        ? null
        : nextNotice;
      state.setState({ notice: visibleNotice, ...(visibleNotice ? {} : { reloadKey: "" }) });
      return updateCountdown();
    } catch {
      clearNotice({ clearReloadKey: true });
      return state.getState();
    } finally {
      refreshInFlight = false;
    }
  }

  return {
    ...state,
    load,
    updateCountdown,
    wasReloaded,
  };
}
