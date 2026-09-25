const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Execute os handlers reais do componente com as dependências de voz isoladas.
// Eventos sintéticos validam consumo de teclas, não os atalhos nativos do Windows.
const source = fs.readFileSync(path.join(__dirname, '../frontend/src/App.svelte'), 'utf8');
const start = source.indexOf('  const reservedSystemShortcutCodes =');
const end = source.indexOf('  function toggleVoiceDeafen()', start);
assert.ok(start >= 0 && end > start, 'handlers de teclado encontrados');

function harness(overrides = {}) {
  const state = {
    pushToTalkCapturing: false, muteShortcutCapturing: false,
    pushToTalkEnabled: true, pushToTalkKey: 'KeyV', pushToTalkActive: false,
    muteShortcut: 'KeyM', isDesktop: false, desktopPushToTalkGlobal: false,
    desktopMuteShortcutGlobal: false, settingsError: '', muted: true, toggles: 0,
    localStorage: { setItem() {} },
    isEditableElement: () => false,
    syncDesktopPushToTalkKey() {}, syncDesktopMuteShortcut() {},
    shortcutLabel: (code) => code,
    ...overrides,
  };
  state.setVoiceMuted = (value) => { state.muted = value; return true; };
  state.toggleVoiceMute = () => { state.toggles++; };
  vm.createContext(state);
  vm.runInContext(source.slice(start, end), state);
  return state;
}

function key(code, modifiers = {}) {
  return { code, repeat: false, defaultPrevented: false, ...modifiers,
    preventDefault() { this.defaultPrevented = true; } };
}

for (const [code, modifiers] of [
  ['AltLeft', {}], ['AltRight', {}], ['MetaLeft', {}], ['MetaRight', {}],
  ['OSLeft', {}], ['OSRight', {}], ['Tab', { altKey: true }],
  ['KeyV', { altKey: true }], ['KeyM', { metaKey: true }],
]) {
  test(`preserva ${code} ${JSON.stringify(modifiers)} no uso e na configuração`, () => {
    for (const capturing of [false, true]) {
      const state = harness({ pushToTalkKey: code, muteShortcut: code,
        pushToTalkCapturing: capturing, muteShortcutCapturing: capturing });
      const event = key(code, modifiers);
      state.handlePushToTalkKeyDown(event);
      state.handleMuteShortcutKeyDown(event);
      assert.equal(event.defaultPrevented, false);
      assert.equal(state.muted, true);
      assert.equal(state.toggles, 0);
      assert.equal(state.pushToTalkCapturing, capturing);
      assert.equal(state.muteShortcutCapturing, capturing);
    }
  });
}

test('PTT normal abre e fecha o microfone; mute continua funcionando', () => {
  const state = harness();
  state.handlePushToTalkKeyDown(key('KeyV'));
  assert.equal(state.muted, false);
  state.handlePushToTalkKeyUp(key('KeyV'));
  assert.equal(state.muted, true);
  assert.equal(state.pushToTalkActive, false);
  state.handleMuteShortcutKeyDown(key('KeyM'));
  assert.equal(state.toggles, 1);
});

for (const modifier of ['altKey', 'metaKey']) {
  test(`soltar PTT com ${modifier} fecha microfone sem consumir atalho`, () => {
    const state = harness();
    state.handlePushToTalkKeyDown(key('KeyV'));
    const event = key('KeyV', { [modifier]: true });
    state.handlePushToTalkKeyUp(event);
    assert.equal(state.muted, true);
    assert.equal(state.pushToTalkActive, false);
    assert.equal(event.defaultPrevented, false);
  });
}

test('perda de foco libera PTT e tecla diferente não o libera', () => {
  const state = harness();
  state.handlePushToTalkKeyDown(key('KeyV'));
  state.handlePushToTalkKeyUp(key('KeyB'));
  assert.equal(state.muted, false);
  state.releasePushToTalk();
  assert.equal(state.muted, true);
  assert.equal(state.pushToTalkActive, false);
});
