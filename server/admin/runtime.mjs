export function createAdminRuntime({
  json,
  currentUser,
  normalizeUsername,
  siteAdminUserIds,
  siteAdminUsernames,
  maintenanceToken,
  maintenanceRepository,
  streamRepository,
  runtimeStreamIsLive,
  rooms,
  voiceRooms,
  siteAdminRepository,
  timingSafeEqual,
}) {
  function isSiteAdmin(user) {
    return Boolean(user && (siteAdminUserIds.has(user.id) || siteAdminUsernames.has(normalizeUsername(user.username))));
  }

  async function requireSiteAdmin(request, response) {
    const user = await currentUser(request);
    if (!user) {
      json(response, 401, { error: "Entre com sua conta para continuar." });
      return null;
    }
    // Não confirmamos a existência do painel para contas autenticadas que não
    // estejam na allowlist. Isso reduz a descoberta por enumeração de rotas.
    if (!isSiteAdmin(user)) {
      json(response, 404, { error: "Not found" });
      return null;
    }
    return user;
  }

  function hasMaintenanceToken(request) {
    const provided = String(request.headers["x-telai-maintenance-token"] || "");
    if (!maintenanceToken || !provided || provided.length !== maintenanceToken.length) return false;
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(maintenanceToken));
    } catch {
      return false;
    }
  }

  async function requireMaintenanceOperator(request, response) {
    if (hasMaintenanceToken(request)) return { type: "token" };
    const user = await currentUser(request);
    if (!user) {
      json(response, 401, { error: "Entre com sua conta para continuar." });
      return null;
    }
    if (!isSiteAdmin(user)) {
      json(response, 404, { error: "Not found" });
      return null;
    }
    return { type: "account", user };
  }

  async function activeMaintenanceNotice() {
    const row = await maintenanceRepository.active(new Date().toISOString());
    if (!row) return null;
    return {
      ...row,
      secondsUntilStart: Math.max(0, Math.ceil((Date.parse(row.startsAt) - Date.now()) / 1000)),
    };
  }

  async function siteAdminOverview() {
    const now = new Date().toISOString();
    const activeStreams = (await streamRepository.listAdminStreams()).filter(runtimeStreamIsLive);
    const liveCountByGroup = new Map();
    for (const stream of activeStreams) {
      if (stream.groupId) liveCountByGroup.set(stream.groupId, (liveCountByGroup.get(stream.groupId) || 0) + 1);
    }
    const [accounts, groupsResult, activeSessions] = await Promise.all([
      siteAdminRepository.listAccounts(now),
      siteAdminRepository.listGroups(),
      siteAdminRepository.countActiveSessions(now),
    ]);
    const groups = groupsResult.map((group) => ({ ...group, liveCount: liveCountByGroup.get(group.id) || 0 }));
    const streams = activeStreams.map((stream) => {
      const room = rooms.get(stream.roomName);
      return {
        id: stream.id,
        roomName: stream.roomName,
        title: stream.title,
        visibility: stream.visibility,
        groupId: stream.groupId,
        groupName: stream.groupName || null,
        creatorName: stream.creatorName,
        creatorUsername: stream.creatorUsername,
        startedAt: stream.startedAt,
        hostConnected: Boolean(room?.host),
        reconnectGrace: Boolean(room?.hostDisconnectedAt),
        viewerCount: room?.viewers?.size || 0,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        accounts: accounts.length,
        groups: groups.length,
        openStreams: streams.length,
        activeSessions,
        runtimeBroadcastRooms: rooms.size,
        runtimeVoiceRooms: voiceRooms.size,
      },
      accounts,
      groups,
      streams,
    };
  }

  async function siteAdminSummary() {
    const now = new Date().toISOString();
    const activeStreams = (await streamRepository.listActiveStreams()).filter(runtimeStreamIsLive);
    const [accounts, groups, activeSessions] = await Promise.all([
      siteAdminRepository.countAccounts(),
      siteAdminRepository.countGroups(),
      siteAdminRepository.countActiveSessions(now),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        accounts,
        groups,
        openStreams: activeStreams.length,
        activeSessions,
        runtimeBroadcastRooms: rooms.size,
        runtimeVoiceRooms: voiceRooms.size,
      },
    };
  }

  function adminPagination(requestUrl) {
    const requestedPage = Number.parseInt(requestUrl.searchParams.get("page") || "1", 10);
    const requestedPageSize = Number.parseInt(requestUrl.searchParams.get("pageSize") || "20", 10);
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(1, requestedPageSize)) : 20;
    const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }

  function adminPage(items, total, page, pageSize) {
    const safeTotal = Number(total || 0);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total: safeTotal,
        pageCount: Math.max(1, Math.ceil(safeTotal / pageSize)),
      },
    };
  }

  async function siteAdminAccountsPage(requestUrl) {
    const { page, pageSize, offset } = adminPagination(requestUrl);
    const now = new Date().toISOString();
    const [total, accounts] = await Promise.all([
      siteAdminRepository.countAccounts(),
      siteAdminRepository.listAccounts(now, pageSize, offset),
    ]);
    return adminPage(accounts, total, page, pageSize);
  }

  async function siteAdminGroupsPage(requestUrl) {
    const { page, pageSize, offset } = adminPagination(requestUrl);
    const total = await siteAdminRepository.countGroups();
    const liveGroups = new Map();
    (await streamRepository.listActiveStreams())
      .filter(runtimeStreamIsLive)
      .forEach((stream) => {
        if (stream.groupId) liveGroups.set(stream.groupId, (liveGroups.get(stream.groupId) || 0) + 1);
      });
    const groups = (await siteAdminRepository.listGroups(pageSize, offset)).map((group) => ({ ...group, liveCount: liveGroups.get(group.id) || 0 }));
    return adminPage(groups, total, page, pageSize);
  }

  async function siteAdminStreamsPage(requestUrl) {
    const { page, pageSize, offset } = adminPagination(requestUrl);
    const streams = (await siteAdminOverview()).streams;
    return adminPage(streams.slice(offset, offset + pageSize), streams.length, page, pageSize);
  }

  async function siteAdminGroupMembersPage(requestUrl, groupId) {
    const { page, pageSize, offset } = adminPagination(requestUrl);
    const group = await siteAdminRepository.findGroupWithOwner(groupId);
    if (!group) return null;
    const [total, members] = await Promise.all([
      siteAdminRepository.countGroupMembers(groupId),
      siteAdminRepository.listGroupMembers(groupId, pageSize, offset),
    ]);
    return { group, ...adminPage(members, total, page, pageSize) };
  }

  return {
    activeMaintenanceNotice,
    requireMaintenanceOperator,
    requireSiteAdmin,
    siteAdminAccountsPage,
    siteAdminGroupsPage,
    siteAdminGroupMembersPage,
    siteAdminOverview,
    siteAdminStreamsPage,
    siteAdminSummary,
  };
}
