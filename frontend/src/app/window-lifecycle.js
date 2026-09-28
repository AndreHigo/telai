function register(target, type, handler, options) {
  if (!target?.addEventListener || typeof handler !== "function") return () => {};
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Centralizes global browser listeners owned by the application shell. */
export function createWindowLifecycle({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  mediaDevicesRef = globalThis.navigator?.mediaDevices,
  bindings = [],
  documentBindings = [],
  mediaBindings = [],
} = {}) {
  let cleanups = [];

  function start() {
    if (cleanups.length) return;
    cleanups = [
      ...bindings.map(([type, handler, options]) => register(windowRef, type, handler, options)),
      ...documentBindings.map(([type, handler, options]) => register(documentRef, type, handler, options)),
      ...mediaBindings.map(([type, handler, options]) => register(mediaDevicesRef, type, handler, options)),
    ];
  }

  function stop() {
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  return { start, stop };
}
