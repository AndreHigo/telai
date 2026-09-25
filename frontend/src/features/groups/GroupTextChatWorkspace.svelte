<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";
  import BotInteraction from "./BotInteraction.svelte";

  export let selectedRoom = null;
  export let roomMessages = [];
  export let currentUserId = "";
  export let editingMessageId = "";
  export let editingMessageDraft = "";
  export let messageDraft = "";
  export let messageAttachments = [];
  export let mentionSuggestions = [];
  export let mentionActiveIndex = 0;
  export let messageComposerInput = null;
  export let onSendMessage = () => {};
  export let onUpdateMentionSuggestions = () => {};
  export let onHandleMessageKeydown = () => {};
  export let onInsertMention = () => {};
  export let onStartEditMessage = () => {};
  export let onCancelEditMessage = () => {};
  export let onSaveEditMessage = () => {};
  export let onDeleteMessage = () => {};
  export let onOpenThread = () => {};
  export let onAddMessageAttachments = () => {};
  export let onRemoveMessageAttachment = () => {};
  export let onSubmitBotComponent = async () => {};
  export let onSubmitBotModal = async () => {};
</script>

<div class="message-list">
  {#if roomMessages.length}
    {#each roomMessages as message}
      <article class:message-pending={message.pending} class="message-item"><span class="message-avatar">{#if message.avatarData}<img src={message.avatarData} alt="" />{:else}{message.displayName?.slice(0, 1) || "M"}{/if}</span><div class="message-content"><div class="message-meta"><strong>{message.displayName}</strong><time>{message.pending ? "enviando…" : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{message.editedAt ? " · editada" : ""}</time></div>{#if editingMessageId === message.id}<textarea class="message-edit-input" bind:value={editingMessageDraft} maxlength="1000" rows="2" aria-label="Editar mensagem"></textarea><div class="message-edit-actions"><button class="primary rounded-lg px-3 py-1 text-xs font-bold" type="button" on:click={() => onSaveEditMessage(message)}>Salvar</button><button class="outline rounded-lg px-3 py-1 text-xs font-bold" type="button" on:click={onCancelEditMessage}>Cancelar</button></div>{:else}{#if message.body}<p>{message.body}</p>{/if}{#if message.attachments?.length}<div class="message-attachments">{#each message.attachments as attachment}<a class="message-attachment" href={attachment.url} target="_blank" rel="noreferrer" download={attachment.name}>{#if attachment.mimeType?.startsWith("image/")}<img src={attachment.url} alt={attachment.name} loading="lazy" />{/if}<span><strong>{attachment.name}</strong><small>{Math.max(1, Math.round(attachment.byteSize / 1024))} KB</small></span></a>{/each}</div>{/if}{#if message.botInteraction}<BotInteraction interactionId={message.interactionId} response={{ type: "message", content: message.body, components: message.components }} onSubmitComponent={onSubmitBotComponent} onSubmitModal={onSubmitBotModal} />{/if}{#if message.threadCount}<button class="message-thread-button" type="button" on:click={() => onOpenThread(message)}>{message.threadCount} {message.threadCount === 1 ? "resposta" : "respostas"}</button>{/if}{#if currentUserId === message.userId && !message.pending}<div class="message-actions"><button type="button" on:click={() => onStartEditMessage(message)}>Editar</button><button type="button" on:click={() => onDeleteMessage(message)}>Excluir</button></div>{/if}{/if}</div></article>
    {/each}
  {:else}
    <div class="message-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("message")} size={24} strokeWidth={1.8} /></span><h2>Comece a conversa</h2><p>Este é o início do canal. Envie uma mensagem para o grupo.</p></div>
  {/if}
</div>
<form class="message-composer" on:submit|preventDefault={onSendMessage}><span class="composer-prefix telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("message")} size={16} strokeWidth={1.8} /></span><textarea bind:this={messageComposerInput} bind:value={messageDraft} on:input={onUpdateMentionSuggestions} on:keydown={onHandleMessageKeydown} maxlength="1000" rows="1" placeholder={`Conversar em #${selectedRoom?.name || "geral"}`} aria-label="Mensagem"></textarea><label class="message-attachment-picker" title="Anexar arquivo"><span aria-hidden="true">＋</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/*,video/*" multiple on:change={onAddMessageAttachments} aria-label="Anexar arquivos" /></label><button class="primary composer-send" type="submit" disabled={!messageDraft.trim() && !messageAttachments.length} aria-label="Enviar mensagem"><HugeiconsIcon icon={iconFor("arrowRight")} size={17} strokeWidth={1.8} /></button>{#if messageAttachments.length}<div class="message-attachment-draft" aria-label="Anexos selecionados">{#each messageAttachments as attachment, index}<span><strong>{attachment.name}</strong><button type="button" aria-label={`Remover ${attachment.name}`} on:click={() => onRemoveMessageAttachment(index)}>×</button></span>{/each}</div>{/if}{#if mentionSuggestions.length}<div class="mention-suggestions" role="listbox" aria-label="Membros para mencionar">{#each mentionSuggestions as member, index}<button class:active={index === mentionActiveIndex} class="mention-suggestion" type="button" role="option" aria-selected={index === mentionActiveIndex} on:mousedown|preventDefault={() => onInsertMention(member)}><span class="mention-avatar">{member.displayName?.slice(0, 1) || "M"}</span><span><strong>{member.displayName || member.username}</strong><small>@{member.username || "usuario"}</small></span></button>{/each}</div>{/if}</form>
