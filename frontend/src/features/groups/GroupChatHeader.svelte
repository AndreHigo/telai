<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let selectedGroup = null;
  export let selectedGroupId = "";
  export let groupLoading = false;
  export let selectedRoom = null;
  export let showMobileChannels = false;
  export let showMobileMembers = false;
  export let onToggleChannels = () => {};
  export let onToggleMembers = () => {};
  export let onCreateChannel = () => {};
</script>

<header class="workspace-heading">
  <div><p class="eyebrow">{selectedGroup?.name || "comunidade"}</p><h1 class="mt-1 text-2xl font-black text-white"><HugeiconsIcon icon={iconFor(selectedRoom?.kind === "voice" ? "volume" : "message")} size={20} strokeWidth={1.8} /> {selectedRoom?.name || "Geral"}</h1><p class="muted mt-1 text-xs">{selectedRoom?.kind === "voice" ? "Conversa por voz com o grupo." : "Conversa com os membros deste canal."}</p></div>
  <div class="workspace-heading-actions">
    <button class="mobile-rail-toggle" type="button" on:click={onToggleChannels} aria-expanded={showMobileChannels} aria-controls="group-channel-rail"><HugeiconsIcon icon={iconFor("grid")} size={16} strokeWidth={1.8} /> Canais</button>
    <button class="mobile-rail-toggle" type="button" on:click={onToggleMembers} aria-expanded={showMobileMembers} aria-controls="group-member-rail"><HugeiconsIcon icon={iconFor("communities")} size={16} strokeWidth={1.8} /> Membros</button>
    <button class="workspace-new-channel outline rounded-xl px-4 py-2 text-xs font-extrabold" on:click={onCreateChannel} disabled={!selectedGroupId || groupLoading}><HugeiconsIcon icon={iconFor("add")} size={16} strokeWidth={1.8} /> Canal</button>
  </div>
</header>
