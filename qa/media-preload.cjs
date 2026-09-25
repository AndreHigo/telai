const { contextBridge } = require("electron");

let displayMediaSourcesListener = null;
let pendingDisplaySourceSelection = null;

contextBridge.exposeInMainWorld("miranteDesktop", {
  isDesktop: true,
  getVersion: async () => "qa",
  checkForUpdates: async () => ({ ok: true }),
  getDisplayMediaSources: async () => [{ id: "qa-source", name: "QA screen", kind: "screen", thumbnail: "", processId: null }],
  onDisplayMediaSources: (callback) => {
    displayMediaSourcesListener = callback;
    return () => {
      if (displayMediaSourcesListener === callback) displayMediaSourcesListener = null;
    };
  },
  emitDisplayMediaSources: (sources) => displayMediaSourcesListener?.(sources),
  waitForDisplaySourceSelection: () => new Promise((resolve, reject) => {
    pendingDisplaySourceSelection = { resolve, reject };
  }),
  selectDisplaySource: () => {
    pendingDisplaySourceSelection?.resolve();
    pendingDisplaySourceSelection = null;
  },
  cancelDisplaySource: () => {
    pendingDisplaySourceSelection?.reject(new DOMException("Seleção de captura cancelada.", "NotAllowedError"));
    pendingDisplaySourceSelection = null;
  },
  setTheme: () => {},
  onPushToTalk: () => () => {},
  onUpdateStatus: () => {},
});
