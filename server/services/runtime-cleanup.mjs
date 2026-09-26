export function createRuntimeCleanup({
  oauthStates,
  groupPresence,
  sessionRepository,
  attachmentLifecycle,
  errorLog,
  presenceTtlMs = 35_000,
  intervalMs = 5 * 60_000,
  attachmentIntervalMs = 15 * 60_000,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let timer = null;
  let attachmentTimer = null;

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

  function pruneAttachmentStorage() {
    Promise.resolve(attachmentLifecycle?.pruneOrphanedStorage?.())
      .catch((error) => errorLog("attachment_orphan_cleanup_error", { error }));
  }

  function start() {
    if (timer) return;
    timer = setIntervalFn(pruneExpiredRuntimeState, intervalMs);
    timer?.unref?.();
    if (attachmentLifecycle?.pruneOrphanedStorage) {
      attachmentTimer = setIntervalFn(pruneAttachmentStorage, Math.max(60_000, Number(attachmentIntervalMs) || 15 * 60_000));
      attachmentTimer?.unref?.();
    }
  }

  function stop() {
    if (!timer) return;
    clearIntervalFn(timer);
    timer = null;
    if (attachmentTimer) {
      clearIntervalFn(attachmentTimer);
      attachmentTimer = null;
    }
  }

  return { pruneExpiredRuntimeState, start, stop, isRunning: () => Boolean(timer) };
}
