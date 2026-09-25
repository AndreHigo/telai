export function createRuntimeCleanup({
  oauthStates,
  groupPresence,
  sessionRepository,
  errorLog,
  presenceTtlMs = 35_000,
  intervalMs = 5 * 60_000,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let timer = null;

  function pruneExpiredRuntimeState() {
    const currentTime = now();
    for (const [key, entry] of oauthStates) {
      if (!entry || entry.expiresAt <= currentTime) oauthStates.delete(key);
    }
    for (const [key, lastSeen] of groupPresence) {
      if (currentTime - lastSeen > presenceTtlMs) groupPresence.delete(key);
    }
    Promise.resolve(sessionRepository.deleteExpired(new Date(currentTime).toISOString()))
      .catch((error) => errorLog("expired_state_cleanup_error", { error }));
  }

  function start() {
    if (timer) return;
    timer = setIntervalFn(pruneExpiredRuntimeState, intervalMs);
    timer?.unref?.();
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
  }

  return { pruneExpiredRuntimeState, start, stop, isRunning: () => Boolean(timer) };
}
