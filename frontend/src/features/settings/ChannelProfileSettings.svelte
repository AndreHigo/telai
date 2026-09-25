<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";

  export let settingsBusy = false;
  export let channelAvatarData = "";
  export let channelDisplayName = "";
  export let gameOptions = [];
  export let channelGames = [];
  export let channelError = "";
  export let onSave = () => {};
  export let onAvatarChange = () => {};
  export let onClearAvatar = () => {};
  export let onToggleChannelGame = () => {};

  let channelAvatarFileInput;
</script>

<form class="settings-card channel-profile-card" on:submit|preventDefault={onSave}><div class="settings-card-heading"><div><p class="eyebrow">identidade do canal</p><h2>Perfil do canal</h2><p class="muted">Configure como seu canal aparece nas lives, cards e no “Ao vivo agora”.</p></div><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={settingsBusy}>Salvar canal</button></div><div class="profile-customization"><span class="profile-avatar-preview channel-avatar-preview">{#if channelAvatarData}<img src={channelAvatarData} alt="" />{:else}{channelDisplayName?.slice(0, 1) || "M"}{/if}</span><div class="profile-customization-copy"><strong>Ícone do canal</strong><p class="muted">Uma imagem própria para diferenciar seu canal da sua conta pessoal.</p><div class="profile-photo-actions"><input bind:this={channelAvatarFileInput} class="settings-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" on:change={onAvatarChange} /><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => channelAvatarFileInput?.click()}>Escolher foto</button>{#if channelAvatarData}<button class="subtle-action" type="button" on:click={onClearAvatar}>Remover</button>{/if}</div><small class="profile-photo-hint">PNG, JPG, WEBP ou GIF · até 5 MB</small></div></div><div class="settings-form-grid"><label>Nome de exibição do canal<input class="settings-input" bind:value={channelDisplayName} maxlength="48" required /></label><div class="channel-games-fieldset"><span class="settings-label">Jogos do canal</span><div class="channel-game-options">{#each gameOptions as game}<button type="button" class:active={channelGames.includes(game)} class="channel-game-option" on:click={() => onToggleChannelGame(game)}>{game}</button>{/each}</div><small class="profile-photo-hint">Escolha até 8. Eles aparecem nos cards e na faixa de lives.</small></div></div>{#if channelError}<p class="settings-error" role="alert">{channelError}</p>{/if}</form>
