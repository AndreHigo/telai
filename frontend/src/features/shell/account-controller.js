export function createAccountController({
  openSettings,
  setSettingsState,
  setUserMenuVisible,
  tick = () => Promise.resolve(),
  documentObject = globalThis.document,
} = {}) {
  async function openDestination(destination) {
    setUserMenuVisible?.(false);
    await openSettings?.("user");
    if (destination === "channel") {
      setSettingsState?.({ settingsSection: "channel" });
      return;
    }
    if (destination === "preferences") {
      await tick();
      documentObject?.querySelector?.(".settings-layout .settings-content > form:nth-of-type(2)")?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function handleGlobalClick(event) {
    if (!event?.target?.closest?.(".account-menu-shell")) setUserMenuVisible?.(false);
  }

  return { openDestination, handleGlobalClick };
}
