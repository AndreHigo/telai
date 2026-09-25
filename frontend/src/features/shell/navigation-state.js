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
  return createStateStore(NAVIGATION_STATE_DEFAULTS, initial);
}
import { createStateStore } from "../../services/state-store.js";
