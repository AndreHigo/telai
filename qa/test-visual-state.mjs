import assert from "node:assert/strict";
import { createVisualStateStore, VISUAL_DEFAULTS, VISUAL_STATE_DEFAULTS, visualStyleFromState } from "../frontend/src/features/settings/visual-state.js";

const store = createVisualStateStore({ theme: "light", buttonColor: "#123456" });
assert.equal(store.getState().theme, "light");
assert.equal(store.getState().buttonColor, "#123456");
assert.equal(store.getState().inputBackgroundColor, VISUAL_STATE_DEFAULTS.inputBackgroundColor);
assert.equal(VISUAL_DEFAULTS.dark.button, "#5b5fea");
assert.match(visualStyleFromState(store.getState()), /--mirante-button-color:#123456/);

store.setState({ backgroundColor: "#abcdef" });
assert.equal(store.getState().backgroundColor, "#abcdef");
store.reset();
assert.deepEqual(store.getState(), VISUAL_STATE_DEFAULTS);

console.log(JSON.stringify({ ok: true, checks: 7, defaults: true, cssVariables: true }));
