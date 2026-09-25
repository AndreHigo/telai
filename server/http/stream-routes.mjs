export function createStreamRoutes({
  json,
  readJson,
  requireUser,
  currentUser,
  streamRepository,
  channelProfileRepository,
  channelProfileForUser,
  groupSettingsRepository,
  groupRoomRepository,
  isGroupMember,
  canGroupAction,
  canAccessStream,
  runtimeStreamIsLive,
  decorateRuntimeStream,
  streamPublicPath,
  closeBroadcastRoom,
  compactAvatarData,
  parseChannelGames,
  slugFor,
  createNotification,
}) {
  return async function handleStreamRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/streams/resolve" && request.method === "GET") {
      const parts = String(requestUrl.searchParams.get("path") || "").split("/").filter(Boolean).map(slugFor);
      if (![1, 2].includes(parts.length) || parts.some((part) => !part)) {
        json(response, 400, { error: "Endereço de transmissão inválido." });
        return true;
      }
      const user = await currentUser(request);
      const activeStreams = (await streamRepository.listActiveStreams()).filter(runtimeStreamIsLive);
      const channelPart = parts.length === 1 ? parts[0] : parts[1];
      const scopedStreams = activeStreams.filter((item) => parts.length === 1
        ? item.visibility === "public"
        : item.visibility === "private" && slugFor(item.groupSlug) === parts[0]);
      const displayNameStreams = scopedStreams.filter((item) => slugFor(item.channelName) === channelPart);
      const exactUsernameStream = scopedStreams.find((item) => slugFor(item.channelUsername) === channelPart);
      const stream = displayNameStreams.length === 1 ? displayNameStreams[0] : exactUsernameStream;
      if (stream) {
        // Do not reveal that a private stream exists to users outside its group.
        if (!await canAccessStream(user?.id, stream)) {
          json(response, 404, { error: "Canal não encontrado." });
          return true;
        }
        json(response, 200, { stream: { ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) } });
        return true;
      }
      const users = await channelProfileRepository.listDirectory();
      const displayNameMatches = users.filter((item) => slugFor(item.channelName) === channelPart);
      const exactUsername = users.find((item) => slugFor(item.username) === channelPart);
      const channel = displayNameMatches.length === 1 ? displayNameMatches[0] : exactUsername;
      if (!channel) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      if (parts.length === 1) {
        json(response, 200, { stream: { channelName: channel.channelName, channelUsername: channel.username, channelAvatarData: compactAvatarData(channel.channelAvatarData), channelGames: channel.channelGames, visibility: "public", publicPath: `/${slugFor(channel.channelName || channel.username)}`, offline: true } });
        return true;
      }
      const group = (await groupSettingsRepository.listDirectoryGroups()).find((item) => slugFor(item.slug) === parts[0]);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      if (!user || !await isGroupMember(user.id, group.id)) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      json(response, 200, { stream: { channelName: channel.channelName, channelUsername: channel.username, channelAvatarData: compactAvatarData(channel.channelAvatarData), channelGames: channel.channelGames, visibility: "private", groupSlug: group.slug, groupName: group.name, publicPath: `/${slugFor(group.slug)}/${slugFor(channel.channelName || channel.username)}`, offline: true } });
      return true;
    }

    if (requestUrl.pathname === "/api/streams" && request.method === "GET") {
      const user = await currentUser(request);
      const followingOnly = requestUrl.searchParams.get("following") === "1";
      if (!user && followingOnly) {
        json(response, 401, { error: "Entre para ver os canais que você segue." });
        return true;
      }
      if (!user) {
        const streams = (await streamRepository.listPublicStreams()).filter(runtimeStreamIsLive);
        json(response, 200, { streams: streams.map((stream) => decorateRuntimeStream({ ...stream, following: false, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })) });
        return true;
      }
      const streams = (await streamRepository.listPublicStreams({ userId: user.id, followingOnly })).filter(runtimeStreamIsLive);
      json(response, 200, { streams: streams.map((stream) => decorateRuntimeStream({ ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })) });
      return true;
    }

    if (requestUrl.pathname === "/api/streams" && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      try {
        const body = await readJson(request);
        const roomName = String(body.roomName || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
        const visibility = body.visibility === "private" ? "private" : "public";
        const groupId = visibility === "private" ? String(body.groupId || "") : null;
        const roomId = visibility === "private" ? String(body.roomId || "") : null;
        const voiceRoomId = visibility === "private" ? String(body.voiceRoomId || "") : null;
        if (roomName.length < 6) return json(response, 400, { error: "Sala inválida." });
        if (visibility === "private" && (!groupId || !await isGroupMember(user.id, groupId))) return json(response, 403, { error: "Escolha um grupo do qual você participa." });
        if (visibility === "private" && !await canGroupAction(user.id, groupId, "canStream")) return json(response, 403, { error: "Você não tem permissão para abrir lives neste grupo." });
        if (visibility === "private" && roomId) {
          const room = await groupRoomRepository.findRoom(groupId, roomId);
          if (!room || room.kind !== "live") return json(response, 400, { error: "Escolha uma sala de transmissão válida." });
        }
        if (visibility === "private" && voiceRoomId) {
          const voiceRoom = await groupRoomRepository.findRoom(groupId, voiceRoomId);
          if (!voiceRoom || voiceRoom.kind !== "voice") return json(response, 400, { error: "Escolha uma sala de voz válida." });
        }
        // Friendly links are based on the broadcaster name (and, for private
        // streams, the group). The repository keeps the check and insert atomic.
        try {
          const group = groupId ? await groupSettingsRepository.findGroup(groupId) : null;
          const groupSlug = group?.slug || "";
          const channel = await channelProfileForUser(user.id) || { displayName: user.displayName, avatarData: user.avatarData, games: [] };
          const result = await streamRepository.createStream({
            roomName, visibility, groupId, roomId: roomId || null, voiceRoomId: voiceRoomId || null,
            title: String(body.title || `Transmissão de ${channel.displayName}`).trim().slice(0, 120),
            channelName: channel.displayName, channelAvatarData: compactAvatarData(channel.avatarData), channelGames: channel.games,
            channelUsername: user.username, createdBy: user.id, groupSlug, isLive: runtimeStreamIsLive,
          });
          if (result.kind === "already-live") {
            return json(response, 409, {
              error: visibility === "public"
                ? "Você já tem uma live pública ativa. Encerre-a antes de abrir outra."
                : "Você já tem uma live privada ativa neste grupo. Encerre-a antes de abrir outra.",
            });
          }
          const stream = result.stream;
          if (stream.visibility === "public") {
            const followers = (await streamRepository.followerIds(user.id)).map((followerId) => ({ followerId }));
            const createdAt = new Date().toISOString();
            await Promise.all(followers.map((follower) => createNotification({
                userId: follower.followerId,
                type: "channel_live",
                entityId: stream.id,
                title: `${stream.channelName} está ao vivo`,
                body: `${stream.channelName} começou uma transmissão pública.`,
                createdAt,
              })));
          }
          return json(response, 201, { stream: { ...stream, publicPath: streamPublicPath(stream) } });
        } catch (error) {
          return json(response, 409, { error: "Não foi possível abrir este canal." });
        }
      } catch {
        json(response, 400, { error: "Não foi possível abrir o canal." });
      }
      return true;
    }

    const streamActionMatch = requestUrl.pathname.match(/^\/api\/streams\/([\w-]{1,64})\/(end|follow)$/);
    if (streamActionMatch && ["POST", "DELETE"].includes(request.method)) {
      const user = await requireUser(request, response);
      if (!user) return true;
      const stream = await streamRepository.findById(streamActionMatch[1]);
      if (!stream) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      if (streamActionMatch[2] === "end") {
        if (stream.createdBy !== user.id) {
          json(response, 403, { error: "Somente o transmissor pode encerrar este canal." });
          return true;
        }
        if (stream.endedAt) {
          await closeBroadcastRoom(stream.roomName);
          json(response, 200, { ok: true, alreadyEnded: true });
          return true;
        }
        await streamRepository.endById(stream.id);
        await closeBroadcastRoom(stream.roomName);
        json(response, 200, { ok: true });
        return true;
      }
      if (stream.createdBy === user.id) {
        json(response, 400, { error: "Você não pode seguir seu próprio canal." });
        return true;
      }
      if (request.method === "POST") {
        await streamRepository.follow(user.id, stream.createdBy, true);
        json(response, 200, { ok: true, following: true });
        return true;
      }
      await streamRepository.follow(user.id, stream.createdBy, false);
      json(response, 200, { ok: true, following: false });
      return true;
    }

    return false;
  };
}
