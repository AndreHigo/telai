<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let selectedGroup = null;
  export let selectedGroupId = "";
  export let groupLoading = false;
  export let groupMembers = [];
  export let user = null;
  export let onBack = () => {};
  export let onInvite = () => {};
  export let onOpenSettings = () => {};
  export let onLeave = () => {};
</script>

<div class="group-workspace-back-row"><button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onBack}><HugeiconsIcon icon={iconFor("arrowLeft")} size={15} strokeWidth={1.8} /> Meus grupos</button></div>
<div class="group-action-bar">
  <div class="group-identity"><div><p class="eyebrow">servidor</p><strong>{selectedGroup?.name || "Seu grupo"}</strong><small>Converse, entre em voz e gerencie a comunidade.</small></div><span class="group-member-summary"><i></i>{groupMembers.length} membros</span></div>
  <div class="group-action-buttons">
    <button class="group-quick-action" type="button" on:click={onInvite} disabled={!selectedGroupId || groupLoading || (selectedGroup?.role !== "owner" && !groupMembers.find((member) => member.id === user?.id)?.canInvite)} aria-label="Convidar pessoa" title="Convidar pessoa"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("userAdd")} size={16} strokeWidth={1.8} /></span><span>Convidar</span></button>
    <button class="group-quick-action" type="button" on:click={onOpenSettings} disabled={!selectedGroupId || groupLoading} aria-label="Configurações do grupo" title="Configurações do grupo"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("settings")} size={16} strokeWidth={1.8} /></span><span>Configurar</span></button>
    {#if selectedGroup?.role !== "owner"}<button class="group-quick-action group-quick-action-icon-only danger-outline" type="button" on:click={onLeave} aria-label="Sair do grupo" title="Sair do grupo"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("logout")} size={16} strokeWidth={1.8} /></span></button>{/if}
  </div>
</div>
