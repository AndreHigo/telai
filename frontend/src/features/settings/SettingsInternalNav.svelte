<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let settingsTab = "user";
  export let selectedGroupId = null;
  export let onSelectTab = () => {};
</script>

<nav class="settings-nav" aria-label="Seções de configuração"><button class:active={settingsTab === "user"} on:click={() => onSelectTab("user")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("userSettings")} size={17} strokeWidth={1.8} /></span><span><strong>Minha conta</strong><small>perfil e preferências</small></span></button><button class:active={settingsTab === "group"} disabled={!selectedGroupId} on:click={() => onSelectTab("group")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("communities")} size={17} strokeWidth={1.8} /></span><span><strong>Grupo selecionado</strong><small>acesso e permissões</small></span></button></nav>
