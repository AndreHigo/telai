import { createStateStore } from "../../services/state-store.js";

export const APPLICATION_COMMAND_STATE_DEFAULTS = Object.freeze({
  groupId: null,
  commands: [],
  loading: false,
  error: "",
});

export function createApplicationCommandStateStore(initial = {}) {
  return createStateStore(APPLICATION_COMMAND_STATE_DEFAULTS, initial, () => ({
    ...APPLICATION_COMMAND_STATE_DEFAULTS,
    commands: [],
  }));
}
