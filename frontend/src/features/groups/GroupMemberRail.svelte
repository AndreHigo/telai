<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let user = null;
  export let memberRoleGroups = [];
  export let memberCount = 0;
  export let showMobileMembers = false;
  export let onOpenUserContextMenu = () => {};
  export let onOpenDirectConversation = () => {};
</script>

<aside class:mobile-open={showMobileMembers} class="member-rail" id="group-member-rail">
  <div class="rail-heading"><div><p class="eyebrow">membros</p><h2 class="mt-1 text-xl font-black text-white">{memberCount}</h2></div></div>
  {#each memberRoleGroups as roleGroup}
    <p class="member-section-label"><span class="member-role-dot" style={`background:${roleGroup.color}`}></span>{roleGroup.name} · {roleGroup.members.length}</p>
    <div class="member-list">
      {#each roleGroup.members as member}
        <div class="member-item">
          <span class="member-avatar">{#if member.avatarData}<img src={member.avatarData} alt="" />{:else}{member.displayName?.slice(0, 1) || "M"}{/if}</span>
          <span><strong>{member.displayName}</strong><small>{member.role === "owner" ? "dono do grupo" : roleGroup.name}</small></span>
          <i class:online={member.online}></i>
          {#if member.id !== user?.id}
            <button class="member-more-action" type="button" aria-label={`Abrir ações de ${member.displayName}`} title={`Ações de ${member.displayName}`} on:click|stopPropagation={(event) => onOpenUserContextMenu(event, member)}><HugeiconsIcon icon={iconFor("more")} size={17} strokeWidth={1.8} /></button>
            <button class="member-message-action" type="button" aria-label={`Enviar mensagem para ${member.displayName}`} title={`Enviar mensagem para ${member.displayName}`} on:click|stopPropagation={() => onOpenDirectConversation(member)}><HugeiconsIcon icon={iconFor("mail")} size={17} strokeWidth={1.8} /></button>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</aside>
