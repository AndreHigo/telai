<script>
  import { onMount } from "svelte";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let api = async () => {};

  let applications = [];
  let selectedApplicationId = "";
  let tokens = [];
  let commands = [];
  let installations = [];
  let groups = [];
  let loading = true;
  let busy = false;
  let error = "";
  let notice = "";
  let revealedToken = "";
  let applicationName = "";
  let applicationDescription = "";
  let tokenLabel = "";
  let commandName = "";
  let commandDescription = "";
  let commandOptions = "";
  let installGroupId = "";
  const installationPermissionOptions = [
    { key: "commands", label: "Comandos" },
    { key: "messages", label: "Mensagens" },
    { key: "interactions", label: "Interações" },
  ];

  $: selectedApplication = applications.find((application) => application.id === selectedApplicationId) || null;
  $: installedGroupIds = new Set(installations.map((installation) => installation.groupId));
  $: availableGroups = groups.filter((group) => !installedGroupIds.has(group.id));

  function setError(cause) {
    error = cause?.message || "Não foi possível atualizar as aplicações.";
    notice = "";
  }

  async function loadApplications(preferredId = selectedApplicationId) {
    loading = true;
    error = "";
    try {
      const result = await api("/api/applications");
      applications = result.applications || [];
      const nextId = applications.some((application) => application.id === preferredId) ? preferredId : applications[0]?.id || "";
      selectedApplicationId = nextId;
      if (nextId) await loadApplicationDetails(nextId);
      else {
        tokens = [];
        commands = [];
        installations = [];
      }
    } catch (cause) {
      setError(cause);
    } finally {
      loading = false;
    }
  }

  async function loadApplicationDetails(applicationId = selectedApplicationId) {
    if (!applicationId) return;
    try {
      const [tokenResult, commandResult, installationResult] = await Promise.all([
        api(`/api/applications/${encodeURIComponent(applicationId)}/tokens`),
        api(`/api/applications/${encodeURIComponent(applicationId)}/commands`),
        api(`/api/applications/${encodeURIComponent(applicationId)}/groups`),
      ]);
      tokens = tokenResult.tokens || [];
      commands = commandResult.commands || [];
      installations = installationResult.installations || [];
    } catch (cause) {
      setError(cause);
    }
  }

  async function loadGroups() {
    try {
      const result = await api("/api/groups");
      groups = result.groups || [];
    } catch (cause) {
      setError(cause);
    }
  }

  async function refresh() {
    await Promise.all([loadApplications(), loadGroups()]);
  }

  async function createApplication() {
    if (busy || applicationName.trim().length < 2) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await api("/api/applications", {
        method: "POST",
        body: JSON.stringify({ name: applicationName.trim(), description: applicationDescription.trim() }),
      });
      applicationName = "";
      applicationDescription = "";
      notice = "Aplicação criada.";
      await loadApplications(result.application?.id || "");
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function createToken() {
    if (busy || !selectedApplicationId) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/tokens`, {
        method: "POST",
        body: JSON.stringify({ label: tokenLabel.trim() || "Token principal" }),
      });
      tokens = [result.tokenInfo, ...tokens];
      revealedToken = result.token || "";
      tokenLabel = "";
      notice = "Token criado. Copie-o agora: ele não será exibido novamente.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function revokeToken(token) {
    if (busy || !selectedApplicationId || token.revokedAt) return;
    busy = true;
    error = "";
    notice = "";
    try {
      await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/tokens/${encodeURIComponent(token.id)}`, { method: "DELETE" });
      tokens = tokens.map((item) => item.id === token.id ? { ...item, revokedAt: new Date().toISOString() } : item);
      notice = "Token revogado.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  function parseOptions() {
    if (!commandOptions.trim()) return undefined;
    const parsed = JSON.parse(commandOptions);
    if (!Array.isArray(parsed)) throw new Error("As opções do comando precisam ser uma lista JSON.");
    return parsed;
  }

  async function createCommand() {
    if (busy || !selectedApplicationId || !commandName.trim() || !commandDescription.trim()) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/commands`, {
        method: "POST",
        body: JSON.stringify({ name: commandName.trim(), description: commandDescription.trim(), options: parseOptions() }),
      });
      commands = [...commands, result.command].sort((left, right) => left.name.localeCompare(right.name));
      commandName = "";
      commandDescription = "";
      commandOptions = "";
      notice = "Comando registrado.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function deleteCommand(command) {
    if (busy || !selectedApplicationId) return;
    busy = true;
    error = "";
    notice = "";
    try {
      await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/commands/${encodeURIComponent(command.id)}`, { method: "DELETE" });
      commands = commands.filter((item) => item.id !== command.id);
      notice = "Comando removido.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function installBot() {
    if (busy || !selectedApplicationId || !installGroupId) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const result = await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/groups/${encodeURIComponent(installGroupId)}`, { method: "POST" });
      installations = [result.installation, ...installations];
      installGroupId = "";
      notice = "Bot instalado no grupo.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function uninstallBot(installation) {
    if (busy || !selectedApplicationId) return;
    busy = true;
    error = "";
    notice = "";
    try {
      await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/groups/${encodeURIComponent(installation.groupId)}`, { method: "DELETE" });
      installations = installations.filter((item) => item.groupId !== installation.groupId);
      notice = "Bot removido do grupo.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function updateInstallationPermission(installation, permission, enabled) {
    if (busy || !selectedApplicationId) return;
    busy = true;
    error = "";
    notice = "";
    const permissions = {
      commands: installation.permissions?.commands !== false,
      messages: installation.permissions?.messages !== false,
      interactions: installation.permissions?.interactions !== false,
      [permission]: enabled,
    };
    try {
      const result = await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}/groups/${encodeURIComponent(installation.groupId)}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions }),
      });
      installations = installations.map((item) => item.groupId === installation.groupId ? result.installation : item);
      notice = "Permissões da instalação atualizadas.";
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function deleteApplication() {
    if (busy || !selectedApplicationId || !window.confirm("Excluir esta aplicação e revogar seus tokens?")) return;
    busy = true;
    error = "";
    notice = "";
    try {
      await api(`/api/applications/${encodeURIComponent(selectedApplicationId)}`, { method: "DELETE" });
      revealedToken = "";
      notice = "Aplicação excluída.";
      await loadApplications("");
    } catch (cause) {
      setError(cause);
    } finally {
      busy = false;
    }
  }

  async function copyToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken);
      notice = "Token copiado para a área de transferência.";
    } catch {
      error = "Não foi possível copiar automaticamente; selecione o token manualmente.";
    }
  }

  async function selectApplication(applicationId) {
    selectedApplicationId = applicationId;
    revealedToken = "";
    error = "";
    notice = "";
    await loadApplicationDetails(applicationId);
  }

  onMount(refresh);
</script>

<section class="applications-settings">
  <div class="settings-card applications-intro">
    <div class="settings-card-heading"><div><p class="eyebrow">desenvolvimento</p><h2>Aplicações e bots</h2><p class="muted">Crie integrações para o Telai sem sair da identidade visual do produto. Tokens aparecem uma única vez e comandos ficam vinculados ao bot escolhido.</p></div><button class="outline" type="button" disabled={loading || busy} on:click={refresh}><HugeiconsIcon icon={iconFor("refresh")} size={16} strokeWidth={1.8} /> Atualizar</button></div>
    {#if error}<p class="settings-error" role="alert">{error}</p>{/if}
    {#if notice}<p class="settings-success" role="status">{notice}</p>{/if}
  </div>

  <div class="applications-layout">
    <div class="applications-sidebar">
      <div class="settings-card">
        <div class="settings-card-heading"><div><h3>Suas aplicações</h3><p class="muted">Cada aplicação possui uma identidade de bot própria.</p></div><span class="settings-count">{applications.length}</span></div>
        {#if loading}<p class="muted">Carregando aplicações…</p>{:else if applications.length}<div class="application-list">{#each applications as application}<button class:active={application.id === selectedApplicationId} class="application-list-item" type="button" aria-current={application.id === selectedApplicationId ? "true" : undefined} on:click={() => selectApplication(application.id)}><span class="application-list-icon"><HugeiconsIcon icon={iconFor("appWindow")} size={17} strokeWidth={1.8} /></span><span><strong>{application.name}</strong><small>{application.bot.displayName}</small></span></button>{/each}</div>{:else}<p class="muted">Nenhuma aplicação criada ainda.</p>{/if}
      </div>
      <form class="settings-card application-form" on:submit|preventDefault={createApplication}>
        <div class="settings-card-heading"><div><h3>Nova aplicação</h3><p class="muted">Comece com um nome e uma descrição curta.</p></div></div>
        <label class="modal-field">Nome<input class="settings-input" bind:value={applicationName} minlength="2" maxlength="64" required placeholder="Meu bot" /></label>
        <label class="modal-field">Descrição<textarea class="settings-input" bind:value={applicationDescription} maxlength="280" rows="3" placeholder="O que essa integração faz?"></textarea></label>
        <button class="primary" type="submit" disabled={busy || applicationName.trim().length < 2}>Criar aplicação</button>
      </form>
    </div>

    {#if selectedApplication}
      <div class="applications-details">
        <div class="settings-card application-identity-card"><div class="settings-card-heading"><div><p class="eyebrow">aplicação selecionada</p><h2>{selectedApplication.name}</h2><p class="muted">{selectedApplication.description || "Sem descrição cadastrada."}</p></div><button class="danger-outline" type="button" disabled={busy} on:click={deleteApplication}>Excluir</button></div><div class="application-bot-identity"><span class="application-list-icon"><HugeiconsIcon icon={iconFor("communities")} size={18} strokeWidth={1.8} /></span><span><strong>{selectedApplication.bot.displayName}</strong><small>@{selectedApplication.bot.username} · identidade do bot</small></span></div></div>

        <div class="application-detail-grid">
          <section class="settings-card"><div class="settings-card-heading"><div><h3>Tokens</h3><p class="muted">Guarde o token em um cofre. O Telai nunca o exibe novamente.</p></div></div>{#if revealedToken}<div class="application-token-reveal" role="status"><code>{revealedToken}</code><button class="outline" type="button" on:click={copyToken}>Copiar</button></div>{/if}<form class="inline-settings-form" on:submit|preventDefault={createToken}><input class="settings-input" bind:value={tokenLabel} maxlength="64" placeholder="Rótulo do token" /><button class="primary" type="submit" disabled={busy}>Gerar token</button></form><div class="application-token-list">{#each tokens as token}<div class="application-row"><span><strong>{token.label}</strong><small>{token.revokedAt ? "Revogado" : token.lastUsedAt ? `Usado em ${new Date(token.lastUsedAt).toLocaleString()}` : "Nunca utilizado"}</small></span>{#if !token.revokedAt}<button class="outline" type="button" disabled={busy} on:click={() => revokeToken(token)}>Revogar</button>{/if}</div>{/each}{#if !tokens.length}<p class="muted">Nenhum token criado.</p>{/if}</div></section>

          <section class="settings-card"><div class="settings-card-heading"><div><h3>Comandos</h3><p class="muted">Registre a superfície que o bot anuncia aos clientes.</p></div></div><form class="application-form" on:submit|preventDefault={createCommand}><label class="modal-field">Nome<input class="settings-input" bind:value={commandName} maxlength="32" pattern="[A-Za-z0-9_-]+" required placeholder="status" /></label><label class="modal-field">Descrição<input class="settings-input" bind:value={commandDescription} maxlength="100" required placeholder="Mostra o status do serviço" /></label><label class="modal-field">Opções JSON <textarea class="settings-input" bind:value={commandOptions} rows="3" placeholder="Lista JSON opcional de opções"></textarea></label><button class="primary" type="submit" disabled={busy || !commandName.trim() || !commandDescription.trim()}>Registrar comando</button></form><div class="application-token-list">{#each commands as command}<div class="application-row"><span><strong>/{command.name}</strong><small>{command.description} · {command.options?.length || 0} opção(ões)</small></span><button class="outline" type="button" disabled={busy} on:click={() => deleteCommand(command)}>Remover</button></div>{/each}{#if !commands.length}<p class="muted">Nenhum comando registrado.</p>{/if}</div></section>
        </div>

        <section class="settings-card"><div class="settings-card-heading"><div><h3>Instalação em grupos</h3><p class="muted">Escolha grupos em que o bot poderá responder e publicar mensagens.</p></div></div>{#if availableGroups.length}<form class="inline-settings-form" on:submit|preventDefault={installBot}><select class="settings-input" bind:value={installGroupId} aria-label="Grupo para instalar o bot"><option value="">Escolha um grupo</option>{#each availableGroups as group}<option value={group.id}>{group.name}</option>{/each}</select><button class="primary" type="submit" disabled={busy || !installGroupId}>Instalar bot</button></form>{:else}<p class="muted">Todos os seus grupos já estão instalados ou você ainda não participa de nenhum.</p>{/if}<div class="application-token-list">{#each installations as installation}<div class="application-row application-installation-row"><span class="application-installation-meta"><strong>{groups.find((group) => group.id === installation.groupId)?.name || installation.groupId}</strong><small>Instalado em {new Date(installation.createdAt).toLocaleDateString()}</small></span><div class="application-permission-list" role="group" aria-label="Permissões da instalação">{#each installationPermissionOptions as permission}<label class="application-permission-toggle"><input type="checkbox" checked={installation.permissions?.[permission.key] !== false} disabled={busy} on:change={(event) => updateInstallationPermission(installation, permission.key, event.currentTarget.checked)} /><span>{permission.label}</span></label>{/each}</div><button class="outline" type="button" disabled={busy} on:click={() => uninstallBot(installation)}>Remover</button></div>{/each}{#if !installations.length}<p class="muted">Este bot ainda não está instalado em nenhum grupo.</p>{/if}</div></section>
      </div>
    {:else if !loading}
      <div class="settings-card application-empty-state"><HugeiconsIcon icon={iconFor("appWindow")} size={28} strokeWidth={1.6} /><h2>Crie sua primeira aplicação</h2><p class="muted">O painel de detalhes aparecerá aqui, sem abrir uma nova tela.</p></div>
    {/if}
  </div>
</section>
