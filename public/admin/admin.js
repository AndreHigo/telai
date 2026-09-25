(() => {
  const $ = (selector) => document.querySelector(selector);
  const pageSize = 20;
  const state = { view: "summary", groupId: "", pages: { streams: 1, groups: 1, accounts: 1, members: 1 } };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const date = (value) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const empty = (message, columns = 8) => `<tr><td class="empty" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
  const metric = (label, value) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;

  function setStatus(message, error = false) {
    $("#status").className = error ? "status error" : "status";
    $("#status").textContent = message;
  }

  async function api(route) {
    const response = await fetch(route, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 ? "Sua sessão expirou." : body.error || "Não foi possível carregar os dados administrativos.");
    return body;
  }

  function renderPagination(target, pagination, onPage) {
    const pageCount = Math.max(1, Number(pagination?.pageCount || 1));
    const page = Math.min(pageCount, Math.max(1, Number(pagination?.page || 1)));
    const total = Number(pagination?.total || 0);
    target.innerHTML = `<div class="pagination"><span>Página ${page} de ${pageCount} · ${total} registro${total === 1 ? "" : "s"}</span><div class="pagination-actions"><button class="pagination-button" type="button" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Anterior</button><button class="pagination-button" type="button" data-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>Próxima</button></div></div>`;
    target.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => onPage(Number(button.dataset.page))));
  }

  function renderSummary(data) {
    const summary = data.summary || {};
    $("#summary").innerHTML = [
      metric("Contas", summary.accounts || 0), metric("Grupos", summary.groups || 0), metric("Lives abertas", summary.openStreams || 0),
      metric("Sessões ativas", summary.activeSessions || 0), metric("Salas de transmissão", summary.runtimeBroadcastRooms || 0), metric("Salas de voz", summary.runtimeVoiceRooms || 0),
    ].join("");
    $("#stream-count").textContent = summary.openStreams || 0;
    $("#group-count").textContent = summary.groups || 0;
    $("#account-count").textContent = summary.accounts || 0;
    setStatus(`Atualizado em ${date(data.generatedAt)}.`);
  }

  function renderStreams(data) {
    $("#stream-count").textContent = data.pagination?.total || 0;
    $("#streams").innerHTML = data.items?.length ? data.items.map((stream) => `<tr><td><strong>${escapeHtml(stream.title)}</strong><small>${escapeHtml(stream.roomName)}</small></td><td><code class="stream-id" title="${escapeHtml(stream.id)}">${escapeHtml(stream.id)}</code></td><td>${escapeHtml(stream.creatorName)}<small>@${escapeHtml(stream.creatorUsername)}</small></td><td>${escapeHtml(stream.visibility === "private" ? (stream.groupName || "privado") : "público")}</td><td>${date(stream.startedAt)}</td><td class="${stream.hostConnected ? "live" : stream.reconnectGrace ? "grace" : "offline"}">${stream.hostConnected ? "transmitindo" : stream.reconnectGrace ? "reconectando" : "sem host"}</td><td>${escapeHtml(stream.viewerCount || 0)}</td></tr>`).join("") : empty("Nenhuma live aberta.", 7);
    renderPagination($("#streams-pagination"), data.pagination, (page) => { state.pages.streams = page; loadView(); });
  }

  function renderGroups(data) {
    $("#group-count").textContent = data.pagination?.total || 0;
    $("#groups").innerHTML = data.items?.length ? data.items.map((group) => `<tr><td><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml(group.slug)}</small></td><td>${escapeHtml(group.ownerName)}<small>${escapeHtml(group.ownerId)}</small></td><td>${escapeHtml(group.memberCount)}</td><td>${escapeHtml(group.liveCount)}</td><td><button class="table-action" type="button" data-group-id="${escapeHtml(group.id)}" data-group-name="${escapeHtml(group.name)}">Ver membros</button></td></tr>`).join("") : empty("Nenhum grupo criado.", 5);
    $("#groups").querySelectorAll("[data-group-id]").forEach((button) => button.addEventListener("click", () => openMembers(button.dataset.groupId, button.dataset.groupName)));
    renderPagination($("#groups-pagination"), data.pagination, (page) => { state.pages.groups = page; loadView(); });
  }

  function renderAccounts(data) {
    $("#account-count").textContent = data.pagination?.total || 0;
    $("#accounts").innerHTML = data.items?.length ? data.items.map((account) => `<tr><td><strong>${escapeHtml(account.displayName)}</strong><small>@${escapeHtml(account.username)}</small></td><td>${escapeHtml(account.email || "não informado")}</td><td>${escapeHtml(account.groupCount)}<small>${escapeHtml(account.ownedGroupCount)} próprio(s)</small></td><td>${date(account.createdAt)}</td><td class="${account.hasActiveSession ? "live" : "offline"}">${account.hasActiveSession ? "ativa" : "inativa"}</td></tr>`).join("") : empty("Nenhuma conta criada.", 5);
    renderPagination($("#accounts-pagination"), data.pagination, (page) => { state.pages.accounts = page; loadView(); });
  }

  function renderMembers(data) {
    $("#members-title").textContent = data.group.name;
    $("#members-subtitle").textContent = `${data.group.ownerName} · ${data.pagination?.total || 0} membro${data.pagination?.total === 1 ? "" : "s"}`;
    $("#members").innerHTML = data.items?.length ? data.items.map((member) => `<tr><td><strong>${escapeHtml(member.displayName)}</strong></td><td>@${escapeHtml(member.username)}</td><td>${member.role === "owner" ? "dono" : "membro"}</td><td>${date(member.joinedAt)}</td></tr>`).join("") : empty("Nenhum membro encontrado.", 4);
    renderPagination($("#members-pagination"), data.pagination, (page) => { state.pages.members = page; loadView(); });
  }

  async function loadView() {
    $("#refresh").disabled = true;
    try {
      if (state.view === "summary") {
        renderSummary(await api("/api/admin/summary"));
      } else if (state.view === "streams") {
        renderStreams(await api(`/api/admin/streams?page=${state.pages.streams}&pageSize=${pageSize}`));
        setStatus("Lives abertas atualizadas.");
      } else if (state.view === "groups") {
        renderGroups(await api(`/api/admin/groups?page=${state.pages.groups}&pageSize=${pageSize}`));
        setStatus("Grupos atualizados.");
      } else if (state.view === "accounts") {
        renderAccounts(await api(`/api/admin/accounts?page=${state.pages.accounts}&pageSize=${pageSize}`));
        setStatus("Contas atualizadas.");
      } else if (state.view === "members") {
        renderMembers(await api(`/api/admin/groups/${encodeURIComponent(state.groupId)}/members?page=${state.pages.members}&pageSize=${pageSize}`));
        setStatus("Membros atualizados.");
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      $("#refresh").disabled = false;
    }
  }

  function setView(view) {
    if (view === "members" && !state.groupId) view = "groups";
    state.view = view;
    document.querySelectorAll(".admin-view").forEach((page) => page.classList.toggle("hidden", page.dataset.page !== view));
    document.querySelectorAll(".admin-nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    loadView();
  }

  function openMembers(groupId, groupName) {
    state.groupId = groupId;
    state.pages.members = 1;
    $("#members-nav").classList.remove("hidden");
    setView("members");
  }

  document.querySelectorAll(".admin-nav-button").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("#back-to-groups").addEventListener("click", () => setView("groups"));
  $("#refresh").addEventListener("click", loadView);
  loadView();
})();
