<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor, notificationIconFor } from "../../config/ui.js";

  export let notificationUnreadCount = 0;
  export let hideReadNotifications = false;
  export let readNotificationCount = 0;
  export let notificationsError = "";
  export let unreadDirectNotification = null;
  export let notificationsLoading = false;
  export let visibleNotifications = [];
  export let notifications = [];
  export let inviteActionId = "";
  export let onMarkAllRead = () => {};
  export let onOpenDirectNotification = () => {};
  export let onMarkNotificationRead = () => {};
  export let onRespondToInvite = () => {};
  export let onReviewNotification = () => {};
  export let onOpenStreamNotification = () => {};
  export let onNavigateHome = () => {};
</script>

<section class="notifications-page window-page" aria-labelledby="notifications-title">
  <header class="notifications-heading">
    <div><p class="eyebrow">central de avisos</p><h1 id="notifications-title" class="mt-2 text-4xl font-black tracking-[-.05em] text-white">Notificações</h1><p class="muted mt-2 max-w-xl text-sm leading-6">Convites, solicitações de entrada e atualizações dos seus grupos ficam reunidos aqui.</p></div>
    <div class="notifications-heading-actions">
      <label class="notification-hide-read"><input type="checkbox" bind:checked={hideReadNotifications} /><span>Ocultar lidas</span>{#if readNotificationCount}<small>{readNotificationCount}</small>{/if}</label>
      <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onMarkAllRead} disabled={!notificationUnreadCount}>Marcar como lidas</button>
      <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onNavigateHome}>Voltar</button>
    </div>
  </header>
  {#if notificationsError}<p class="settings-error" role="alert">{notificationsError}</p>{/if}
  {#if unreadDirectNotification}<div class="notification-direct-action"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("mail")} size={20} strokeWidth={1.8} /></span><div><strong>Você recebeu uma mensagem privada</strong><p class="muted">Abra a conversa para responder.</p></div><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onOpenDirectNotification(unreadDirectNotification)}>Abrir mensagens</button></div>{/if}
  {#if notificationsLoading}
    <div class="notifications-loading">Atualizando notificações…</div>
  {:else if visibleNotifications.length}
    <div class="notifications-list">
      {#each visibleNotifications as notification (notification.id)}
        <article class:unread={notification.unread} class:read={!notification.unread} class="notification-card" data-notification-id={notification.id}>
          <button class="notification-open" type="button" aria-label={notification.unread ? `Marcar como lida: ${notification.title}` : `Notificação lida: ${notification.title}`} aria-pressed={!notification.unread} on:click={() => onMarkNotificationRead(notification)}>
            <span class="notification-icon" aria-hidden="true"><HugeiconsIcon icon={notificationIconFor(notification.type, notification.joinRequestStatus)} size={18} strokeWidth={1.8} /></span>
            <span class="notification-copy">
              <span class="notification-meta"><strong>{notification.title}</strong><time>{new Date(notification.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time></span>
              {#if notification.liveContext}<span class="notification-live-context"><span class:private={notification.liveContext.visibility === "private"} class="notification-live-badge">{notification.liveContext.visibilityLabel}</span><span>{notification.liveContext.locationLabel}</span></span>{:else}<span class="notification-body">{notification.body}</span>{/if}
            </span>
            {#if notification.unread}<span class="notification-unread-dot" title="Não lida"></span>{/if}
          </button>
          {#if notification.type === "group_invite" && notification.actionable}
            <div class="notification-actions"><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={inviteActionId === notification.entityId} on:click={() => onRespondToInvite(notification, "accept")}>{inviteActionId === notification.entityId ? "Aceitando…" : "Aceitar convite"}</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={inviteActionId === notification.entityId} on:click={() => onRespondToInvite(notification, "decline")}>Recusar</button></div>
          {:else if notification.type === "group_join_request" && notification.actionable}
            <div class="notification-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onReviewNotification(notification)}>Ver solicitações</button></div>
          {:else if notification.type === "group_join_decision" && notification.joinRequestStatus === "approved"}
            <div class="notification-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onReviewNotification(notification)}>Abrir grupo</button></div>
          {:else if notification.type === "channel_live" && notification.actionable}
            <div class="notification-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onOpenStreamNotification(notification)}>Assistir live</button></div>
          {:else if ["friend_request", "friend_accepted"].includes(notification.type)}
            <div class="notification-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => onReviewNotification(notification)}>Abrir Amigos</button></div>
          {/if}
        </article>
      {/each}
    </div>
  {:else if notifications.length && hideReadNotifications}
    <div class="notifications-empty notifications-filter-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("check")} size={24} strokeWidth={1.8} /></span><h2>Notificações lidas ocultas</h2><p>Elas continuam salvas. Você pode mostrá-las novamente quando quiser.</p><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => hideReadNotifications = false}>Mostrar notificações lidas</button></div>
  {:else}
    <div class="notifications-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("notification")} size={24} strokeWidth={1.8} /></span><h2>Nenhuma notificação por enquanto</h2><p>Quando houver convites ou atualizações dos seus grupos, elas aparecerão aqui.</p></div>
  {/if}
</section>
