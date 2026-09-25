import { createStateStore } from "../../services/state-store.js";

export const DIRECT_STATE_DEFAULTS = Object.freeze({
  directConversations: [],
  directConversationId: "",
  directConversationTarget: null,
  directMessages: [],
  directMessageDraft: "",
  directConversationLoading: false,
  directConversationSending: false,
  directConversationError: "",
  directConversationsRefreshInFlight: false,
  directConversationRefreshInFlight: false,
  directConversationRefreshQueued: false,
  directConversationRefreshId: "",
});

export function createDirectStateStore(initial = {}) {
  return createStateStore(DIRECT_STATE_DEFAULTS, initial, () => ({
    ...DIRECT_STATE_DEFAULTS,
    directConversations: [],
    directMessages: [],
  }));
}
