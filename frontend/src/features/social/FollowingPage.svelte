<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let social = { following: [] };
  export let socialError = "";
  export let socialActionId = "";
  export let onToggleFollowUser = () => {};
  export let onNavigateFriends = () => {};
  export let onNavigateHome = () => {};
</script>

<section class="social-page window-page" aria-labelledby="following-title">
  <header class="social-heading">
    <div><p class="eyebrow">seus canais</p><h1 id="following-title">Seguindo</h1><p class="muted">Acompanhe os canais que você escolheu seguir.</p></div>
    <div class="social-heading-actions"><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onNavigateFriends}>Amigos</button><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onNavigateHome}>Voltar</button></div>
  </header>
  {#if socialError}<p class="settings-error" role="alert">{socialError}</p>{/if}
  <section class="social-list-panel social-following-panel">
    <div class="social-panel-heading"><div><p class="eyebrow">canais seguidos</p><h2>Seguindo</h2></div><span>{social.following.length}</span></div>
    {#if social.following.length}
      <div class="social-following-grid">{#each social.following as channel}<article class="social-following-card"><span class="social-person-avatar">{#if channel.channelAvatarData}<img src={channel.channelAvatarData} alt="" />{:else}{channel.channelName?.slice(0, 1) || "M"}{/if}</span><span class="social-person-copy"><strong>{channel.channelName}</strong><small>@{channel.username}</small></span><button class="subtle-action" type="button" on:click={() => onToggleFollowUser({ id: channel.id, displayName: channel.channelName, following: true })} disabled={socialActionId === `follow:${channel.id}`}>Deixar de seguir</button></article>{/each}</div>
    {:else}
      <div class="social-empty-state"><span class="social-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={22} strokeWidth={1.8} /></span><p class="social-empty">Os canais que você seguir aparecerão aqui.</p></div>
    {/if}
  </section>
</section>
