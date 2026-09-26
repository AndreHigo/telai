export function createAttachmentLifecycle({
  groupAttachmentRepository,
  attachmentStorage,
  errorLog = () => {},
  infoLog = () => {},
  orphanGraceMs = 24 * 60 * 60_000,
  maxDeletesPerRun = 100,
  now = () => Date.now(),
} = {}) {
  async function pruneOrphanedStorage() {
    if (!attachmentStorage?.supportsListing || typeof attachmentStorage.list !== "function") {
      return { supported: false, removed: 0, skipped: true };
    }
    try {
      const referencedKeys = new Set(await groupAttachmentRepository.listStorageKeys());
      const candidates = await attachmentStorage.list({
        olderThan: now() - Math.max(60_000, Number(orphanGraceMs) || 24 * 60 * 60_000),
        limit: Math.max(1, Number(maxDeletesPerRun) || 100),
      });
      let removed = 0;
      for (const candidate of candidates) {
        if (referencedKeys.has(candidate.storageKey)) continue;
        try {
          await attachmentStorage.remove(candidate.storageKey);
          removed += 1;
        } catch (error) {
          errorLog("attachment_orphan_remove_error", { error, storageKey: candidate.storageKey });
        }
      }
      if (removed) infoLog("attachment_orphans_removed", { removed });
      return { supported: true, removed, scanned: candidates.length };
    } catch (error) {
      errorLog("attachment_orphan_cleanup_error", { error });
      return { supported: true, removed: 0, error: true };
    }
  }

  return { pruneOrphanedStorage };
}
