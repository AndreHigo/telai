<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let user = null;
  export let directConversationError = "";
  export let directConversations = [];
  export let directConversationId = "";
  export let directConversationTarget = null;
  export let directConversationLoading = false;
  export let directMessages = [];
  export let directMessageDraft = "";
  export let directConversationSending = false;
  export let onOpenConversation = () => {};
  export let onSendMessage = () => {};
  export let onMessageKeydown = () => {};
  export let onNavigateHome = () => {};
</script>

<section class="direct-messages-page window-page" aria-labelledby="direct-messages-title">
  <header class="direct-messages-heading">
    <div><p class="eyebrow">conversa privada</p><h1 id="direct-messages-title">Mensagens</h1><p class="muted">Converse diretamente com pessoas do Telai. Só os dois participantes têm acesso ao conteúdo.</p></div>
    <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onNavigateHome}>Voltar</button>
  </header>
  {#if directConversationError}<p class="settings-error" role="alert">{directConversationError}</p>{/if}
  <div class="direct-messages-layout">
    <aside class="direct-conversation-list" aria-label="Conversas">
      <div class="direct-list-heading"><strong>Conversas</strong><span>{directConversations.length}</span></div>
      {#if directConversations.length}
        {#each directConversations as conversation}
          <button class:active={conversation.id === directConversationId} class="direct-conversation-item" type="button" on:click={() => onOpenConversation(conversation.id)}>
            <span class="direct-avatar">{#if conversation.otherUser.avatarData}<img src={conversation.otherUser.avatarData} alt="" />{:else}{conversation.otherUser.displayName?.slice(0, 1) || "M"}{/if}</span>
            <span class="direct-conversation-copy"><strong>{conversation.otherUser.displayName}</strong><small>{conversation.lastBody || "Comece uma conversa"}</small></span>
            {#if conversation.unreadCount}<b class="direct-unread-count">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</b>{/if}
          </button>
        {/each}
      {:else}
        <p class="direct-list-empty">Clique em um membro para iniciar uma conversa.</p>
      {/if}
    </aside>
    <section class="direct-chat-panel" aria-label="Conversa selecionada">
      {#if directConversationTarget}
        <header class="direct-chat-heading"><span class="direct-avatar">{#if directConversationTarget.avatarData}<img src={directConversationTarget.avatarData} alt="" />{:else}{directConversationTarget.displayName?.slice(0, 1) || "M"}{/if}</span><div><strong>{directConversationTarget.displayName}</strong><small>@{directConversationTarget.username}</small></div></header>
        {#if directConversationLoading}<div class="direct-loading">Carregando conversa…</div>{/if}
        <div class="direct-message-list">
          {#if directMessages.length}
            {#each directMessages as message}
              <article class:own={message.senderId === user?.id} class="direct-message-item"><span class="message-avatar">{#if message.avatarData}<img src={message.avatarData} alt="" />{:else}{message.displayName?.slice(0, 1) || "M"}{/if}</span><div><div class="message-meta"><strong>{message.senderId === user?.id ? "Você" : message.displayName}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{message.body}</p></div></article>
            {/each}
          {:else}
            <div class="direct-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("mail")} size={24} strokeWidth={1.8} /></span><h2>Comece a conversa</h2><p>Envie uma mensagem privada para {directConversationTarget.displayName}.</p></div>
          {/if}
        </div>
        <form class="message-composer direct-composer" on:submit|preventDefault={onSendMessage}><span class="composer-prefix telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("mail")} size={16} strokeWidth={1.8} /></span><textarea bind:value={directMessageDraft} on:keydown={onMessageKeydown} maxlength="1000" rows="1" placeholder={`Conversar com ${directConversationTarget.displayName}`} aria-label="Mensagem privada"></textarea><button class="primary composer-send" type="submit" disabled={!directMessageDraft.trim() || directConversationSending} aria-label="Enviar mensagem"><HugeiconsIcon icon={iconFor("arrowRight")} size={17} strokeWidth={1.8} /></button></form>
      {:else}
        <div class="direct-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("mail")} size={24} strokeWidth={1.8} /></span><h2>Escolha uma conversa</h2><p>Abra o perfil de um membro e clique em “Enviar mensagem”.</p></div>
      {/if}
    </section>
  </div>
</section>
