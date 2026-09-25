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
  return createStateStore(MESSAGE_STATE_DEFAULTS, initial, () => ({
      ...MESSAGE_STATE_DEFAULTS,
      messageAttachments: [],
      mentionSuggestions: [],
      groupThreadMessages: [],
      groupMessageSearchResults: [],
    }));
}
import { createStateStore } from "../../services/state-store.js";
