export const MESSAGE_STATE_DEFAULTS = Object.freeze({
  messageDraft: "",
  messageAttachments: [],
  editingMessageId: "",
  editingMessageDraft: "",
  mentionSuggestions: [],
  mentionStartIndex: -1,
  mentionActiveIndex: 0,
  activeGroupThread: null,
  groupThreadMessages: [],
  groupThreadDraft: "",
  groupThreadBusy: false,
  groupThreadError: "",
  groupMessageSearchQuery: "",
  groupMessageSearchResults: [],
  groupMessageSearchBusy: false,
  groupMessageSearchError: "",
});

export function createMessageStateStore(initial = {}) {
  let current = { ...MESSAGE_STATE_DEFAULTS, ...initial };
  const subscribers = new Set();

  function getState() {
    return current;
  }

  function setState(next) {
    const patch = typeof next === "function" ? next(current) : next;
    if (!patch || typeof patch !== "object") return current;
    current = { ...current, ...patch };
    for (const subscriber of subscribers) subscriber(current);
    return current;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") return () => {};
    subscribers.add(subscriber);
    subscriber(current);
    return () => subscribers.delete(subscriber);
  }

  function reset() {
    return setState({
      ...MESSAGE_STATE_DEFAULTS,
      messageAttachments: [],
      mentionSuggestions: [],
      groupThreadMessages: [],
      groupMessageSearchResults: [],
    });
  }

  return { getState, setState, subscribe, reset };
}
