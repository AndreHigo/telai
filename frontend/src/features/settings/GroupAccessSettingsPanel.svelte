<script>
  export let selectedGroup = null;
  export let GroupChannelPermissionsSettings = null;
  export let GroupAuditLogSettings = null;
  export let rooms = [];
  export let selectedRoomPermissionId = "";
  export let groupRoles = [];
  export let groupRoomPermissions = [];
  export let roomPermissionBusyKey = "";
  export let activeGroupInvites = [];
  export let groupInviteLink = "";
  export let groupInviteCreating = false;
  export let groupInviteBusyId = "";
  export let groupMembers = [];
  export let user = null;
  export let groupJoinRequests = [];
  export let groupJoinActionId = "";
  export let groupAuditEntries = [];
  export let groupAuditLoading = false;
  export let api = null;
  export let selectedGroupId = "";
  export let groupAdminError = "";

  export let onLoadRoom = () => {};
  export let onUpdatePermission = () => {};
  export let onResetPermission = () => {};
  export let onCreateInvite = () => {};
  export let onCopyInvite = () => {};
  export let onDeleteInvite = () => {};
  export let onRespondJoinRequest = () => {};
  export let onModerationComplete = () => {};
</script>

{#if GroupChannelPermissionsSettings}<svelte:component this={GroupChannelPermissionsSettings} {rooms} bind:selectedRoomId={selectedRoomPermissionId} {groupRoles} permissions={groupRoomPermissions} isOwner={selectedGroup?.role === "owner"} busyKey={roomPermissionBusyKey} onLoadRoom={onLoadRoom} onUpdatePermission={onUpdatePermission} onResetPermission={onResetPermission} />{:else}<div class="workspace-loading"><span></span><span></span><span></span></div>{/if}
<section class="settings-card">
  <div class="settings-card-heading"><div><p class="eyebrow">acesso</p><h2>Convites</h2><p class="muted">Gere um link temporário para adicionar pessoas a este servidor.</p></div><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={onCreateInvite} disabled={groupInviteCreating || (selectedGroup?.role !== "owner" && !groupMembers.find((member) => member.id === user?.id)?.canInvite)}>{groupInviteCreating ? "Criando…" : "Criar convite"}</button></div>
  <p class="admin-help">Cada convite vale por 72 horas e permite até 5 entradas.</p>
  {#if groupInviteLink}<div class="invite-link-row"><input class="settings-input" readonly value={groupInviteLink} aria-label="Link do convite" /><button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onCopyInvite}>Copiar</button></div>{/if}
  <div class="invite-table-wrap"><table class="invite-table"><thead><tr><th>Link</th><th>Usos</th><th>Expiração</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>{#each activeGroupInvites as invite, index}<tr><td><code>telai.tv.br/convite/{index + 1}</code></td><td>{invite.uses}/{invite.maxUses}</td><td>{new Date(invite.expiresAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td><td><button class="invite-delete-button" type="button" on:click={() => onDeleteInvite(invite)} disabled={selectedGroup?.role !== "owner" || groupInviteBusyId === invite.tokenHash} aria-label="Revogar convite" title="Revogar convite">⌫</button></td></tr>{/each}{#if !activeGroupInvites.length}<tr><td class="invite-table-empty" colspan="4">Nenhum convite ativo no momento.</td></tr>{/if}</tbody></table></div>
</section>
{#if selectedGroup?.role === "owner"}<section class="settings-card join-requests-card"><div class="settings-card-heading"><div><p class="eyebrow">entrada no grupo</p><h2>Solicitações pendentes</h2><p class="muted">Aprove ou recuse quem pediu para entrar nesta comunidade.</p></div><span class="join-request-count">{groupJoinRequests.length}</span></div>{#if groupJoinRequests.length}<div class="join-request-list">{#each groupJoinRequests as joinRequest}<div class="join-request-row"><span class="member-avatar">{#if joinRequest.avatarData}<img src={joinRequest.avatarData} alt="" />{:else}{joinRequest.displayName?.slice(0, 1) || "M"}{/if}</span><span><strong>{joinRequest.displayName}</strong><small>@{joinRequest.username}</small></span><div class="join-request-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === joinRequest.id} on:click={() => onRespondJoinRequest(joinRequest, "rejected")}>Recusar</button><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === joinRequest.id} on:click={() => onRespondJoinRequest(joinRequest, "approved")}>{groupJoinActionId === joinRequest.id ? "Salvando…" : "Aprovar"}</button></div></div>{/each}</div>{:else}<p class="muted settings-empty">Nenhuma solicitação pendente.</p>{/if}</section>{/if}
{#if selectedGroup?.role === "owner" && GroupAuditLogSettings}<svelte:component this={GroupAuditLogSettings} entries={groupAuditEntries} hasMore={false} loading={groupAuditLoading} {groupMembers} {api} groupId={selectedGroupId} onModerationComplete={onModerationComplete} />{/if}
{#if groupAdminError}<p class="settings-error" role="alert">{groupAdminError}</p>{/if}
