<script>
  export let query = "";
  export let results = [];
  export let busy = false;
  export let error = "";
  export let rooms = [];
  export let onQueryChange = () => {};
  export let onSearch = () => {};
  export let onClose = () => {};
  export let onSelect = () => {};

  function roomName(roomId) {
    return rooms.find((room) => room.id === roomId)?.name || "Geral";
  }

  function formatMessageDate(value) {
    return new Date(value).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={onClose}>
  <div class="modal-shell modal-compact group-message-search-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="group-message-search-title" on:click|stopPropagation on:keydown|stopPropagation>
    <header class="modal-header">
      <div>
        <p class="eyebrow">histórico da comunidade</p>
        <h2 id="group-message-search-title">Buscar mensagens</h2>
        <p class="muted">Procure no histórico deste grupo sem alterar o canal atual.</p>
      </div>
      <button class="modal-close outline" type="button" aria-label="Fechar busca de mensagens" on:click={onClose}>×</button>
    </header>
    <div class="modal-body">
      <form class="modal-search-row" on:submit|preventDefault={onSearch}>
        <input class="settings-input" value={query} on:input={(event) => onQueryChange(event.currentTarget.value)} placeholder="Palavra ou frase" autocomplete="off" />
        <button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={busy}>{busy ? "Buscando…" : "Pesquisar"}</button>
      </form>
      {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
      {#if results.length}
        <div class="group-message-search-results">
          {#each results as message}
            <button class="group-message-search-result" type="button" on:click={() => onSelect(message)}>
              <span class="message-avatar">{message.displayName?.slice(0, 1) || "M"}</span>
              <span>
                <strong>{message.displayName}</strong>
                <small>{roomName(message.roomId)} · {formatMessageDate(message.createdAt)}</small>
                <p>{message.body || "Mensagem com anexo"}</p>
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
