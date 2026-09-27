const RESERVED_SYSTEM_SHORTCUT_CODES = new Set([
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "Tab",
]);

const KEY_LABELS = {
  Space: "Espaço",
  ControlLeft: "Ctrl esquerdo",
  ControlRight: "Ctrl direito",
  ShiftLeft: "Shift esquerdo",
  ShiftRight: "Shift direito",
  AltLeft: "Alt esquerdo",
  AltRight: "Alt direito",
  Escape: "Esc",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
};

const MOUSE_LABELS = {
  0: "Botão esquerdo",
  1: "Botão do meio",
  2: "Botão direito",
  3: "Botão lateral 1",
  4: "Botão lateral 2",
};

export function pushToTalkLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code?.startsWith("Key")) return code.slice(3);
  if (code?.startsWith("Digit")) return code.slice(5);
  return code || "Nenhuma tecla";
}

export function shortcutLabel(shortcut) {
  if (shortcut?.startsWith("mouse:")) {
    const button = Number(shortcut.slice(6));
    return MOUSE_LABELS[button] || `Botão ${button + 1}`;
  }
  return pushToTalkLabel(shortcut);
}

export function isEditableElement(element) {
  return Boolean(element?.matches?.("input, textarea, select, [contenteditable='true']"));
}

export function isReservedSystemShortcut(event) {
  return RESERVED_SYSTEM_SHORTCUT_CODES.has(event?.code) || Boolean(event?.altKey || event?.metaKey);
}

function safeStorage(storage) {
  return storage && typeof storage.setItem === "function" && typeof storage.removeItem === "function"
    ? storage
    : null;
}

export function createVoiceShortcutController({
  getState,
  setState,
  setVoiceMuted,
  toggleVoiceMute,
  desktop = globalThis.window?.miranteDesktop,
  storage = globalThis.localStorage,
}) {
  const localStorage = safeStorage(storage);

  const state = () => getState();
  const update = (next) => setState(next);
  const setSettingsError = (settingsError) => update({ settingsError });

  async function syncDesktopPushToTalkKey() {
    if (!desktop?.setPushToTalkKey) {
      update({ desktopPushToTalkGlobal: false });
      return;
    }
    try {
      const current = state();
      const result = await desktop.setPushToTalkKey(current.pushToTalkEnabled ? current.pushToTalkKey : "");
      update({ desktopPushToTalkGlobal: Boolean(result?.ok && result?.global) });
      if (!result?.ok && current.pushToTalkKey) {
        setSettingsError(result.message || "Não foi possível registrar essa tecla global.");
      }
    } catch {
      update({ desktopPushToTalkGlobal: false });
    }
  }

  async function syncDesktopMuteShortcut() {
    if (!desktop?.setMuteShortcut) {
      update({ desktopMuteShortcutGlobal: false });
      return;
    }
    try {
      const current = state();
      const result = await desktop.setMuteShortcut(current.muteShortcut);
      update({ desktopMuteShortcutGlobal: Boolean(result?.ok && result?.global) });
      if (!result?.ok && current.muteShortcut) {
        setSettingsError(result.message || "Não foi possível registrar o atalho de mudo.");
      }
    } catch {
      update({ desktopMuteShortcutGlobal: false });
    }
  }

  async function syncDesktopShortcuts() {
    await Promise.all([syncDesktopPushToTalkKey(), syncDesktopMuteShortcut()]);
  }

  function handleDesktopPushToTalk(payload = {}) {
    const current = state();
    if (current.voiceState !== "connected") return;
    const active = Boolean(payload.active);
    if (active && !setVoiceMuted(false)) return;
    if (!active) setVoiceMuted(true);
    update({ pushToTalkActive: active });
  }

  function startPushToTalkCapture() {
    update({ pushToTalkCapturing: true });
    setSettingsError("Pressione uma tecla agora. Esc cancela.");
  }

  function clearPushToTalkKey() {
    const current = state();
    if (current.pushToTalkActive) {
      update({ pushToTalkActive: false });
      setVoiceMuted(true);
    }
    update({ pushToTalkKey: "" });
    localStorage?.removeItem("mirante-push-to-talk");
    void syncDesktopPushToTalkKey();
    setSettingsError("Tecla de push-to-talk removida. Clique em Salvar preferências.");
  }

  function togglePushToTalk(event) {
    const pushToTalkEnabled = Boolean(event.currentTarget.checked);
    update({ pushToTalkEnabled });
    localStorage?.setItem("mirante-push-to-talk-enabled", String(pushToTalkEnabled));
    if (!pushToTalkEnabled && state().pushToTalkActive) {
      update({ pushToTalkActive: false });
      setVoiceMuted(true);
    }
    void syncDesktopPushToTalkKey();
  }

  function startMuteShortcutCapture() {
    update({ muteShortcutCapturing: true });
    setSettingsError("Pressione uma tecla ou botão do mouse agora. Esc cancela.");
  }

  function clearMuteShortcut() {
    update({ muteShortcutCapturing: false, muteShortcut: "" });
    localStorage?.removeItem("mirante-mute-shortcut");
    void syncDesktopMuteShortcut();
    setSettingsError("Atalho de mudo removido. Clique em Salvar preferências.");
  }

  function handlePushToTalkKeyDown(event) {
    const current = state();
    if (current.pushToTalkCapturing) {
      if (event.code === "Escape") {
        event.preventDefault();
        update({ pushToTalkCapturing: false });
        setSettingsError("Escolha de tecla cancelada.");
      } else if (isReservedSystemShortcut(event)) {
        setSettingsError("Alt, Windows e Tab ficam reservados para o sistema. Escolha outra tecla.");
      } else if (event.code) {
        event.preventDefault();
        update({ pushToTalkKey: event.code, pushToTalkCapturing: false });
        localStorage?.setItem("mirante-push-to-talk", event.code);
        void syncDesktopPushToTalkKey();
        setSettingsError(`Tecla ${pushToTalkLabel(event.code)} definida. Clique em Salvar preferências.`);
      }
      return;
    }
    if (current.isDesktop && current.desktopPushToTalkGlobal) return;
    if (!current.pushToTalkEnabled || !current.pushToTalkKey || event.code !== current.pushToTalkKey || event.repeat || isEditableElement(event.target) || isReservedSystemShortcut(event)) return;
    event.preventDefault();
    if (!current.pushToTalkActive && setVoiceMuted(false)) update({ pushToTalkActive: true });
  }

  function handleMuteShortcutKeyDown(event) {
    const current = state();
    if (current.muteShortcutCapturing) {
      if (event.code === "Escape") {
        event.preventDefault();
        update({ muteShortcutCapturing: false });
        setSettingsError("Escolha de atalho cancelada.");
      } else if (isReservedSystemShortcut(event)) {
        setSettingsError("Alt, Windows e Tab ficam reservados para o sistema. Escolha outra tecla ou um botão lateral do mouse.");
      } else if (event.code) {
        event.preventDefault();
        update({ muteShortcut: event.code, muteShortcutCapturing: false });
        localStorage?.setItem("mirante-mute-shortcut", event.code);
        void syncDesktopMuteShortcut();
        setSettingsError(`Atalho ${shortcutLabel(event.code)} definido. Clique em Salvar preferências.`);
      }
      return;
    }
    if (current.isDesktop && current.desktopMuteShortcutGlobal) return;
    if (!current.muteShortcut || current.muteShortcut.startsWith("mouse:") || event.code !== current.muteShortcut || event.repeat || isEditableElement(event.target) || isReservedSystemShortcut(event)) return;
    event.preventDefault();
    toggleVoiceMute();
  }

  function handleMuteShortcutMouseDown(event) {
    const current = state();
    if (current.muteShortcutCapturing) {
      if (event.button < 3) {
        setSettingsError("Para evitar cliques acidentais, use um botão lateral do mouse (4 ou 5).");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const muteShortcut = `mouse:${event.button}`;
      update({ muteShortcut, muteShortcutCapturing: false });
      localStorage?.setItem("mirante-mute-shortcut", muteShortcut);
      void syncDesktopMuteShortcut();
      setSettingsError(`Atalho ${shortcutLabel(muteShortcut)} definido. Clique em Salvar preferências.`);
      return;
    }
    if (!current.muteShortcut?.startsWith("mouse:") || isEditableElement(event.target) || Number(current.muteShortcut.slice(6)) !== event.button) return;
    event.preventDefault();
    toggleVoiceMute();
  }

  function handleDesktopMuteShortcut() {
    if (state().voiceState === "connected") toggleVoiceMute();
  }

  function handlePushToTalkKeyUp(event) {
    const current = state();
    if (event.code !== current.pushToTalkKey || !current.pushToTalkActive) return;
    if (!isReservedSystemShortcut(event)) event.preventDefault();
    update({ pushToTalkActive: false });
    setVoiceMuted(true);
  }

  function releasePushToTalk() {
    if (!state().pushToTalkActive) return;
    update({ pushToTalkActive: false });
    setVoiceMuted(true);
  }

  return {
    clearMuteShortcut,
    clearPushToTalkKey,
    handleDesktopMuteShortcut,
    handleDesktopPushToTalk,
    handleMuteShortcutKeyDown,
    handleMuteShortcutMouseDown,
    handlePushToTalkKeyDown,
    handlePushToTalkKeyUp,
    pushToTalkLabel,
    releasePushToTalk,
    shortcutLabel,
    startMuteShortcutCapture,
    startPushToTalkCapture,
    syncDesktopMuteShortcut,
    syncDesktopPushToTalkKey,
    syncDesktopShortcuts,
    togglePushToTalk,
  };
}
