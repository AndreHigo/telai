import assert from "node:assert/strict";
import { createAvatarController } from "../frontend/src/features/settings/avatar-controller.js";

class FakeFileReader {
  readAsDataURL(file) {
    this.result = `data:${file.type};base64,qa`;
    queueMicrotask(() => this.onload?.());
  }
}

globalThis.FileReader = FakeFileReader;

const updates = [];
const avatarInput = { value: "selected" };
const channelInput = { value: "selected" };
let state = {
  maxAvatarFileBytes: 5 * 1024 * 1024,
  avatarFileInput: avatarInput,
  channelAvatarFileInput: channelInput,
  channelGames: ["R.O.H.A.N.2"],
};
const controller = createAvatarController({
  getState: () => state,
  setState: (next) => {
    updates.push(next);
    state = { ...state, ...next };
  },
});

const eventFor = (file) => ({ currentTarget: { files: [file], value: "selected" } });
controller.handleAvatarChange(eventFor({ type: "text/plain", size: 10 }));
assert.equal(updates.at(-1).avatarError, "Escolha uma imagem PNG, JPG, WEBP ou GIF.");

controller.handleChannelAvatarChange(eventFor({ type: "image/png", size: 6 * 1024 * 1024 }));
assert.equal(updates.at(-1).channelError, "A foto do canal precisa ter no máximo 5 MB.");

controller.handleAvatarChange(eventFor({ type: "image/png", size: 10 }));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(state.settingsAvatarData, "data:image/png;base64,qa");

controller.toggleChannelGame("Minecraft");
assert.deepEqual(state.channelGames, ["R.O.H.A.N.2", "Minecraft"]);
controller.clearAvatar();
controller.clearChannelAvatar();
assert.equal(avatarInput.value, "");
assert.equal(channelInput.value, "");

console.log("avatar controller: ok");
