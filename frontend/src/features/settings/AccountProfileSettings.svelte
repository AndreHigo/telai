<script>
  export let settingsBusy = false;
  export let user = null;
  export let settingsAvatarData = "";
  export let settingsDisplayName = "";
  export let avatarError = "";
  export let onSave = () => {};
  export let onAvatarChange = () => {};
  export let onClearAvatar = () => {};

  let avatarFileInput;
</script>

<form class="settings-card" on:submit|preventDefault={onSave}><div class="settings-card-heading"><div><p class="eyebrow">perfil público</p><h2>Como você aparece</h2><p class="muted">Esse nome será mostrado no chat, nos membros e nas transmissões.</p></div><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={settingsBusy}>Salvar perfil</button></div><div class="profile-customization"><span class="profile-avatar-preview">{#if settingsAvatarData}<img src={settingsAvatarData} alt="" />{:else}{user.displayName?.slice(0, 1) || "M"}{/if}</span><div class="profile-customization-copy"><strong>Foto de perfil</strong><p class="muted">Apareça do seu jeito no chat, nos membros e nas salas de voz.</p><div class="profile-photo-actions"><input bind:this={avatarFileInput} class="settings-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" on:change={onAvatarChange} /><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => avatarFileInput?.click()}>Escolher foto</button>{#if settingsAvatarData}<button class="subtle-action" type="button" on:click={onClearAvatar}>Remover</button>{/if}</div><small class="profile-photo-hint">PNG, JPG, WEBP ou GIF · até 5 MB</small>{#if avatarError}<p class="settings-error profile-photo-error" role="alert">{avatarError}</p>{/if}</div></div><div class="settings-form-grid"><label>Nome de exibição<input class="settings-input" bind:value={settingsDisplayName} maxlength="48" required /></label><label>Nome de usuário<input class="settings-input" value={user.username} readonly /></label></div></form>
