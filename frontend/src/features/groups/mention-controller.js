export function createMentionController({ getState, setState, getMembers, getInput, tick }) {
  function clearSuggestions() {
    setState({ mentionSuggestions: [], mentionStartIndex: -1, mentionActiveIndex: 0 });
  }

  function updateSuggestions(event) {
    const input = event?.currentTarget;
    const state = getState();
    const cursor = input?.selectionStart ?? state.messageDraft.length;
    const draft = String(input?.value ?? state.messageDraft);
    const beforeCursor = draft.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
    if (!match) {
      clearSuggestions();
      return;
    }
    const query = (match[1] || "").toLocaleLowerCase();
    const mentionStartIndex = cursor - query.length - 1;
    const suggestions = (getMembers() || [])
      .filter((member) => {
        const username = String(member.username || "").toLocaleLowerCase();
        const displayName = String(member.displayName || "").toLocaleLowerCase();
        return !query || username.includes(query) || displayName.includes(query);
      })
      .slice(0, 6);
    setState({
      mentionStartIndex: suggestions.length ? mentionStartIndex : -1,
      mentionSuggestions: suggestions,
      mentionActiveIndex: Math.min(state.mentionActiveIndex, Math.max(suggestions.length - 1, 0)),
    });
  }

  async function insertMention(member) {
    const state = getState();
    const input = getInput();
    if (!member || !input || state.mentionStartIndex < 0) return;
    const cursor = input.selectionStart ?? state.messageDraft.length;
    const mentionName = member.username || member.displayName || "usuario";
    const nextDraft = `${state.messageDraft.slice(0, state.mentionStartIndex)}@${mentionName} ${state.messageDraft.slice(cursor)}`;
    const nextCursor = state.mentionStartIndex + mentionName.length + 2;
    setState({ messageDraft: nextDraft });
    clearSuggestions();
    await tick();
    input.focus();
    input.setSelectionRange(nextCursor, nextCursor);
  }

  function handleKeydown(event) {
    const state = getState();
    if (state.mentionSuggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setState({ mentionActiveIndex: (state.mentionActiveIndex + direction + state.mentionSuggestions.length) % state.mentionSuggestions.length });
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        void insertMention(state.mentionSuggestions[state.mentionActiveIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearSuggestions();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return { clearSuggestions, updateSuggestions, insertMention, handleKeydown };
}
