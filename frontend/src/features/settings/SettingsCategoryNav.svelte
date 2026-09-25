<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let settingsSection = "profile";
  export let selectedGroupId = null;
  export let onSelectSection = () => {};
  export let onLoadGroupAdministration = () => {};
</script>

<nav class="settings-category-nav" aria-label="Categorias de configuração">
  <button class:active={settingsSection === "profile"} type="button" on:click={() => onSelectSection("profile")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("userSettings")} size={17} strokeWidth={1.8} /></span><strong>Perfil</strong><small>conta e preferências</small></button>
  <button class:active={settingsSection === "channel"} type="button" on:click={() => onSelectSection("channel")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={17} strokeWidth={1.8} /></span><strong>Canal</strong><small>nome, foto e jogos</small></button>
  <button class:active={settingsSection === "voice"} type="button" on:click={() => onSelectSection("voice")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={17} strokeWidth={1.8} /></span><strong>Áudio e voz</strong><small>microfone e saída</small></button>
  <button class:active={settingsSection === "notifications"} type="button" on:click={() => onSelectSection("notifications")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("notification")} size={17} strokeWidth={1.8} /></span><strong>Notificações</strong><small>avisos de lives</small></button>
  <button class:active={settingsSection === "group"} type="button" disabled={!selectedGroupId} on:click={() => { onSelectSection("group", "group"); if (selectedGroupId) onLoadGroupAdministration(); }}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("communities")} size={17} strokeWidth={1.8} /></span><strong>Grupo</strong><small>cargos e permissões</small></button>
</nav>
