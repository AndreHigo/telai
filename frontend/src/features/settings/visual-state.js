import { createStateStore } from "../../services/state-store.js";

export const VISUAL_DEFAULTS = Object.freeze({
  dark: Object.freeze({ button: "#5b5fea", input: "#0d1728", background: "#070b16" }),
  light: Object.freeze({ button: "#4256d6", input: "#ffffff", background: "#f7f8fc" }),
});

export const VISUAL_STATE_DEFAULTS = Object.freeze({
  theme: "dark",
  buttonColor: VISUAL_DEFAULTS.dark.button,
  inputBackgroundColor: VISUAL_DEFAULTS.dark.input,
  backgroundColor: VISUAL_DEFAULTS.dark.background,
});

export function createVisualStateStore(initial = {}) {
  return createStateStore(VISUAL_STATE_DEFAULTS, initial);
}

export function visualStyleFromState(state) {
  return `--mirante-button-color:${state.buttonColor};--mirante-input-background:${state.inputBackgroundColor};--mirante-background:${state.backgroundColor};`;
}
