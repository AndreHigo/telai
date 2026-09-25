<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let parent = null;
  export let messages = [];
  export let currentUserId = "";
  export let draft = "";
  export let busy = false;
  export let error = "";
  export let onDraftChange = () => {};
  export let onSend = () => {};
  export let onClose = () => {};
  export let onStartEdit = () => {};
  export let onDelete = () => {};

  function displayDate(value) {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={onClose}>
  <div class="group-thread-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="group-thread-title" on:click|stopPropagation on:keydown|stopPropagation>
    <header class="group-thread-header">
      <div>
        <p class="eyebrow">conversa encadeada</p>
        <h2 id="group-thread-title">Respostas</h2>
        <p class="muted">Continue este assunto sem poluir o canal principal.</p>
      </div>
      <button class="modal-close outline" type="button" aria-label="Fechar respostas" on:click={onClose}>×</button>
    </header>
    <div class="group-thread-parent">
      <span class="message-avatar">{parent?.displayName?.slice(0, 1) || "M"}</span>
      <div><div class="message-meta"><strong>{parent?.displayName}</strong><time>{displayDate(parent?.createdAt)}</time></div><p>{parent?.body || "Mensagem com anexo"}</p></div>
    </div>
    <div class="group-thread-messages">
      {#if messages.length}
        {#each messages as message}
          <article class="group-thread-message">
            <span class="message-avatar">{message.displayName?.slice(0, 1) || "M"}</span>
            <div class="message-content">
              <div class="message-meta"><strong>{message.displayName}</strong><time>{displayDate(message.createdAt)}{message.editedAt ? " · editada" : ""}</time></div>
              <p>{message.body}</p>
              {#if currentUserId === message.userId}<div class="message-actions"><button type="button" on:click={() => onStartEdit(message)}>Editar</button><button type="button" on:click={() => onDelete(message)}>Excluir</button></div>{/if}
            </div>
          </article>
        {/each}
      {:else}
        <div class="group-thread-empty"><HugeiconsIcon icon={iconFor("message")} size={22} strokeWidth={1.8} /><p>Seja o primeiro a responder.</p></div>
      {/if}
    </div>
    <form class="group-thread-composer" on:submit|preventDefault={onSend}>
      <textarea value={draft} on:input={(event) => onDraftChange(event.currentTarget.value)} maxlength="1000" rows="2" placeholder="Escreva uma resposta…" aria-label="Resposta"></textarea>
      {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
      <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="submit" disabled={busy || !draft.trim()}>{busy ? "Enviando…" : "Responder"}</button>
    </form>
  </div>
</div>
