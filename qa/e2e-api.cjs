const assert = require("node:assert/strict");
const { WebSocket } = require("ws");

const base = process.env.BASE_URL || "http://127.0.0.1:8799";
const wsBase = base.replace(/^http/, "ws");
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const sockets = new Set();
const failures = [];
let passed = 0;

async function request(path, options = {}) {
  const headers = { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers || {}) };
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, setCookie: response.headers.get("set-cookie") || "" };
}

async function check(label, fn) {
  try { await fn(); passed += 1; }
  catch (error) { failures.push(`${label}: ${error.message}`); }
}

async function expectStatus(label, path, options, status) {
  const result = await request(path, options);
  assert.equal(result.response.status, status, `${label} HTTP ${result.response.status} != ${status} ${JSON.stringify(result.body)}`);
  return result;
}

async function register(username, displayName) {
  const result = await expectStatus(`register ${username}`, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName, password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  }, 201);
  const cookie = result.setCookie.split(",")[0].split(";")[0];
  assert.match(cookie, /^mirante_session=/);
  return { cookie, user: result.body.user };
}

async function api(session, path, method = "GET", body) {
  return request(path, {
    method,
    headers: session ? { cookie: session.cookie } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function openSocket(session) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsBase}/signal`, { headers: session ? { Cookie: session.cookie } : {} });
    const messages = [];
    let opened = false;
    const fail = (error) => { if (!opened) reject(error); };
    socket.on("open", () => { opened = true; sockets.add(socket); resolve({ socket, messages }); });
    socket.on("message", (raw) => { try { messages.push(JSON.parse(raw.toString())); } catch {} });
    socket.on("error", fail);
  });
}

function waitFor(connection, predicate, timeoutMs = 3500) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const match = connection.messages.find(predicate);
      if (match) return resolve(match);
      if (Date.now() - started >= timeoutMs) return reject(new Error(`evento não recebido; mensagens: ${JSON.stringify(connection.messages.slice(-8))}`));
      setTimeout(poll, 20);
    };
    poll();
  });
}

function send(connection, message) { connection.socket.send(JSON.stringify(message)); }

async function main() {
  const owner = await register(`qaowner${suffix}`.slice(0, 32), "QA Owner");
  const member = await register(`qamember${suffix}`.slice(0, 32), "QA Member");
  const outsider = await register(`qaoutsider${suffix}`.slice(0, 32), "QA Outsider");
  const guest = await register(`qaguest${suffix}`.slice(0, 32), "QA Guest");

  await check("health and runtime routes", async () => {
    for (const path of ["/healthz", "/runtime-config", "/ice-config", "/svelte/", "/favicon.svg"]) {
      const result = await request(path);
      assert.equal(result.response.status, 200, `${path} returned ${result.response.status}`);
    }
    assert.equal((await request("/app.js")).response.status, 404);
    assert.equal((await request("/index.html")).response.status, 404);
  });
  await check("unauthenticated access", async () => {
    assert.equal((await api(null, "/api/groups")).response.status, 401);
    assert.equal((await api(null, "/api/auth/session")).response.status, 200);
    assert.equal((await api(null, "/api/auth/session")).body.user, null);
  });
  await check("amizades, seguir canais e mensagem sem amizade", async () => {
    assert.equal((await api(member, "/api/social")).response.status, 200);
    const friendRequest = await api(member, "/api/friends/" + owner.user.id, "POST");
    assert.equal(friendRequest.response.status, 201);
    const incoming = await api(owner, "/api/social");
    assert.ok(incoming.body.incomingRequests.some((item) => item.id === friendRequest.body.requestId));
    assert.equal((await api(owner, `/api/friends/requests/${friendRequest.body.requestId}/accept`, "POST")).response.status, 200);
    assert.ok((await api(member, "/api/social")).body.friends.some((item) => item.id === owner.user.id));
    assert.equal((await api(member, "/api/friends/" + owner.user.id, "DELETE")).response.status, 200);
    const conversation = await api(member, "/api/direct/conversations", "POST", { userId: owner.user.id });
    assert.equal(conversation.response.status, 201);
    const sentMessage = await api(member, `/api/direct/conversations/${conversation.body.conversation.id}/messages`, "POST", { body: "Olá sem amizade" });
    assert.equal(sentMessage.response.status, 201);
    assert.equal(Object.prototype.hasOwnProperty.call(sentMessage.body.message, "avatarData"), false);
    const directMessages = await api(member, `/api/direct/conversations/${conversation.body.conversation.id}/messages`);
    assert.equal(directMessages.response.status, 200);
    assert.equal(directMessages.body.conversation.otherUser, null);
    assert.ok(directMessages.body.messages.length >= 1);
    assert.ok(directMessages.body.messages.every((message) => !Object.prototype.hasOwnProperty.call(message, "avatarData")));
    const directMessagesWithTarget = await api(member, `/api/direct/conversations/${conversation.body.conversation.id}/messages?includeAvatar=1`);
    assert.equal(directMessagesWithTarget.response.status, 200);
    assert.equal(directMessagesWithTarget.body.conversation.otherUser.id, owner.user.id);
    const search = await api(member, `/api/users/search?q=${encodeURIComponent(owner.user.username)}`);
    assert.equal(search.body.users.find((item) => item.id === owner.user.id)?.friendshipStatus, "none");
    assert.equal((await api(member, "/api/users/" + owner.user.id + "/follow", "POST")).body.following, true);
    assert.ok((await api(member, "/api/social")).body.following.some((item) => item.id === owner.user.id));
    assert.equal((await api(member, "/api/users/" + owner.user.id + "/follow", "DELETE")).body.following, false);
  });
  await check("consentimento e direitos da conta", async () => {
    assert.equal((await request("/api/auth/register", { method: "POST", body: JSON.stringify({ username: `qanoaccept${suffix}`.slice(0, 32), displayName: "QA No Consent", password: "SenhaQA123!" }) })).response.status, 400);
    const exported = await api(owner, "/api/account/export");
    assert.equal(exported.response.status, 200);
    assert.match(exported.response.headers.get("content-disposition") || "", /telai-dados-/);
    assert.equal(exported.body.account.username, owner.user.username);
    assert.equal(exported.body.account.password_hash, undefined);
    assert.equal(exported.body.legal.consents.length, 2);
    const sessionBefore = await api(owner, "/api/auth/session");
    assert.equal(sessionBefore.body.user.legal.required, false);
    const accepted = await api(owner, "/api/auth/consent", "POST", { termsAccepted: true, privacyAccepted: true });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.body.legal.required, false);
    const sessionAfter = await api(owner, "/api/auth/session");
    assert.equal(sessionAfter.body.user.legal.required, false);
    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: owner.user.username, password: "SenhaQA123!" }),
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.legal.required, false);
    assert.equal((await api(guest, "/api/account/delete", "POST", { confirmation: "incorreto" })).response.status, 400);
    assert.equal((await api(guest, "/api/account/delete", "POST", { confirmation: `EXCLUIR ${guest.user.username.toUpperCase()}` })).response.status, 200);
    assert.equal((await api(guest, "/api/auth/session")).body.user, null);
    assert.equal((await api(guest, "/api/account/export")).response.status, 401);
  });
  await check("preferences including push-to-talk and colors", async () => {
    const saved = await api(owner, "/api/auth/preferences", "PATCH", {
      theme: "light", defaultQuality: "high", defaultAudio: "source",
      buttonColor: "#112233", inputBackgroundColor: "#223344", backgroundColor: "#334455",
      pushToTalkKey: "KeyV", voiceMicrophoneVolume: 0.72, voiceOutputVolume: 0.64,
      preferredInputDeviceId: "qa-microphone-device", preferredOutputDeviceId: "qa-speaker-device",
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.preferences.pushToTalkKey, "KeyV");
    const loaded = (await api(owner, "/api/auth/preferences")).body.preferences;
    assert.equal(loaded.backgroundColor, "#334455");
    assert.equal(loaded.voiceMicrophoneVolume, 0.72);
    assert.equal(loaded.voiceOutputVolume, 0.64);
    assert.equal(loaded.preferredInputDeviceId, "qa-microphone-device");
    assert.equal(loaded.preferredOutputDeviceId, "qa-speaker-device");
    const volumeOnly = await api(owner, "/api/auth/preferences", "PATCH", { voiceMicrophoneVolume: 0.71 });
    assert.equal(volumeOnly.body.preferences.preferredInputDeviceId, "qa-microphone-device");
    assert.equal(volumeOnly.body.preferences.theme, "light");
  });
  await check("persistent per-user voice preferences", async () => {
    const saved = await api(owner, "/api/auth/voice-preferences", "PATCH", {
      targetUserId: member.user.id,
      volume: 0.37,
      locallyMuted: true,
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.preference.targetUserId, member.user.id);
    assert.equal(saved.body.preference.volume, 0.37);
    assert.equal(saved.body.preference.locallyMuted, true);
    const loaded = await api(owner, "/api/auth/voice-preferences");
    assert.equal(loaded.response.status, 200);
    assert.deepEqual(loaded.body.preferences.find((preference) => preference.targetUserId === member.user.id), {
      targetUserId: member.user.id,
      volume: 0.37,
      locallyMuted: true,
      updatedAt: saved.body.preference.updatedAt,
    });
    assert.equal((await api(owner, "/api/auth/voice-preferences", "DELETE")).response.status, 200);
  });
  await check("channel profile and user search", async () => {
    assert.equal((await api(owner, "/api/auth/channel", "PATCH", { displayName: "QA Channel", games: ["League of Legends"] })).response.status, 200);
    const result = await api(owner, `/api/users/search?q=${encodeURIComponent(member.user.username)}`);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.users.some((user) => user.id === member.user.id));
  });

  const groupResult = await expectStatus("create group", "/api/groups", {
    method: "POST", headers: { cookie: owner.cookie },
    body: JSON.stringify({ name: `QA Group ${suffix}`, slug: `qa-group-${suffix}`.slice(0, 64) }),
  }, 201);
  const group = groupResult.body.group;
  const groupId = group.id;

  await check("group access and rooms", async () => {
    assert.equal((await api(owner, `/api/groups/${groupId}/overview`)).response.status, 200);
    assert.equal((await api(member, `/api/groups/${groupId}/overview`)).response.status, 403);
    const textRoom = await api(owner, `/api/groups/${groupId}/rooms`, "POST", { name: "QA Chat", kind: "text" });
    assert.equal(textRoom.response.status, 201);
    const voiceOne = await api(owner, `/api/groups/${groupId}/rooms`, "POST", { name: "QA Voice One", kind: "voice" });
    const voiceTwo = await api(owner, `/api/groups/${groupId}/rooms`, "POST", { name: "QA Voice Two", kind: "voice" });
    assert.equal(voiceOne.response.status, 201);
    assert.equal(voiceTwo.response.status, 201);
    assert.equal(voiceOne.body.room.maxParticipants, 8);
    const configuredVoice = await api(owner, `/api/groups/${groupId}/rooms/${voiceOne.body.room.id}`, "PATCH", { name: "QA Voice One", maxParticipants: 2 });
    assert.equal(configuredVoice.response.status, 200);
    assert.equal(configuredVoice.body.room.maxParticipants, 2);
    group.textRoomId = textRoom.body.room.id;
    group.voiceOneId = voiceOne.body.room.id;
    group.voiceTwoId = voiceTwo.body.room.id;
  });
  await check("public group search", async () => {
    const result = await api(member, `/api/groups/search?q=${encodeURIComponent(group.name)}`);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.groups.some((item) => item.id === groupId));
  });
  await check("join request, notification and approval", async () => {
    const requestResult = await api(member, `/api/groups/${groupId}/join-requests`, "POST", {});
    assert.equal(requestResult.response.status, 201);
    assert.equal((await api(member, `/api/groups/${groupId}/join-requests`, "POST", {})).response.status, 409);
    const pending = await api(owner, `/api/groups/${groupId}/join-requests`);
    assert.equal(pending.response.status, 200);
    const joinRequest = pending.body.requests.find((item) => item.userId === member.user.id);
    assert.ok(joinRequest);
    const ownerNotifications = await api(owner, "/api/notifications");
    assert.ok(ownerNotifications.body.notifications.length >= 1);
    assert.equal((await api(owner, `/api/groups/${groupId}/join-requests/${joinRequest.id}`, "PATCH", { status: "approved" })).response.status, 200);
    const memberNotifications = await api(member, "/api/notifications");
    assert.ok(memberNotifications.body.notifications.some((item) => item.type === "group_join_decision"));
    assert.equal((await api(member, `/api/groups/${groupId}/overview`)).response.status, 200);
  });
  await check("group chat and presence", async () => {
    assert.equal((await api(member, `/api/groups/${groupId}/presence`, "POST", { roomId: group.textRoomId })).response.status, 200);
    const presence = await api(member, `/api/groups/${groupId}/presence`);
    assert.equal(presence.response.status, 200);
    assert.equal(presence.body.groupId, groupId);
    assert.ok(presence.body.members.some((item) => item.id === member.user.id && item.online === true));
    assert.ok(presence.body.members.every((item) => Object.keys(item).sort().join(",") === "id,online"));
    assert.equal((await api(member, `/api/groups/${groupId}/messages`, "POST", { roomId: group.textRoomId, body: "mensagem QA" })).response.status, 201);
    const overview = await api(owner, `/api/groups/${groupId}/overview`);
    assert.ok(overview.body.messages.some((message) => message.body === "mensagem QA"));
    assert.ok(overview.body.members.some((item) => item.id === member.user.id));
  });
  await check("permissions deny and restore", async () => {
    const adminBefore = await api(owner, `/api/groups/${groupId}/admin`);
    const defaultRole = adminBefore.body.roles.find((role) => role.isDefault);
    assert.ok(defaultRole);
    let result = await api(owner, `/api/groups/${groupId}/roles/${defaultRole.id}`, "PATCH", {
      name: defaultRole.name, color: defaultRole.color,
      canChat: false, canStream: false, canInvite: false, canViewVoiceMembers: false, canMoveMembers: false,
    });
    assert.equal(result.response.status, 200);
    assert.equal((await api(member, `/api/groups/${groupId}/messages`, "POST", { roomId: group.textRoomId, body: "negada" })).response.status, 403);
    assert.equal((await api(member, `/api/groups/${groupId}/rooms`, "POST", { name: "Denied Voice", kind: "voice" })).response.status, 403);
    result = await api(owner, `/api/groups/${groupId}/roles/${defaultRole.id}`, "PATCH", {
      name: defaultRole.name, color: defaultRole.color,
      canChat: true, canStream: true, canInvite: true, canViewVoiceMembers: true, canMoveMembers: false,
    });
    assert.equal(result.response.status, 200);
  });
  await check("roles and member assignment", async () => {
    const roleResult = await api(owner, `/api/groups/${groupId}/roles`, "POST", { name: "QA Moderator", color: "#ff6600", canChat: true, canStream: true, canInvite: true, canViewVoiceMembers: true, canMoveMembers: true });
    assert.equal(roleResult.response.status, 201);
    const roleId = roleResult.body.role.id;
    assert.equal(roleResult.body.role.canChat, true);
    assert.equal(roleResult.body.role.canMoveMembers, true);
    const updatedRole = await api(owner, `/api/groups/${groupId}/roles/${roleId}`, "PATCH", { name: "QA Moderador", color: "#00aaff", canChat: true, canStream: false, canInvite: true, canViewVoiceMembers: false, canMoveMembers: true });
    assert.equal(updatedRole.response.status, 200);
    assert.equal(updatedRole.body.role.name, "QA Moderador");
    assert.equal(updatedRole.body.role.color, "#00aaff");
    assert.equal(updatedRole.body.role.canStream, false);
    assert.equal(updatedRole.body.role.canViewVoiceMembers, false);
    const secondRoleResult = await api(owner, `/api/groups/${groupId}/roles`, "POST", { name: "QA Helper", color: "#00cc88" });
    assert.equal(secondRoleResult.response.status, 201);
    const reordered = await api(owner, `/api/groups/${groupId}/roles/order`, "PATCH", { roleIds: [secondRoleResult.body.role.id, roleId, (await api(owner, `/api/groups/${groupId}/admin`)).body.roles.find((role) => role.isDefault).id] });
    assert.equal(reordered.response.status, 200);
    assert.deepEqual(reordered.body.roles.map((role) => role.id), [secondRoleResult.body.role.id, roleId, reordered.body.roles.find((role) => role.isDefault).id]);
    assert.equal((await api(owner, `/api/groups/${groupId}/members/${member.user.id}/role`, "PATCH", { roleId })).response.status, 200);
    const admin = await api(owner, `/api/groups/${groupId}/admin`);
    assert.ok(admin.body.roles.some((role) => role.id === roleId));
    assert.deepEqual(admin.body.roles.map((role) => role.id).slice(0, 2), [secondRoleResult.body.role.id, roleId]);
    const overview = await api(owner, `/api/groups/${groupId}/overview`);
    assert.ok(overview.body.members.some((item) => item.id === member.user.id && item.roleId === roleId && item.roleSortOrder === 1));
    assert.equal((await api(member, `/api/groups/${groupId}/roles`, "POST", { name: "Invalid Moderator" })).response.status, 403);
    const defaultRole = (await api(owner, `/api/groups/${groupId}/admin`)).body.roles.find((role) => role.isDefault);
    assert.ok(defaultRole);
    const deletedRole = await api(owner, `/api/groups/${groupId}/roles/${roleId}`, "DELETE");
    assert.equal(deletedRole.response.status, 200);
    assert.equal(deletedRole.body.fallbackRoleId, defaultRole.id);
    assert.equal((await api(owner, `/api/groups/${groupId}/roles/${secondRoleResult.body.role.id}`, "DELETE")).response.status, 200);
    const afterDelete = await api(owner, `/api/groups/${groupId}/overview`);
    assert.ok(afterDelete.body.members.some((item) => item.id === member.user.id && item.roleId === defaultRole.id));
    assert.equal((await api(owner, `/api/groups/${groupId}/roles/${defaultRole.id}`, "DELETE")).response.status, 400);
  });
  await check("direct invite and public invite", async () => {
    const invite = await api(owner, `/api/groups/${groupId}/member-invites`, "POST", { userId: outsider.user.id });
    assert.equal(invite.response.status, 201);
    assert.equal((await api(outsider, `/api/member-invites/${invite.body.invite.id}/accept`, "POST")).response.status, 200);
    assert.equal((await api(member, `/api/groups/${groupId}/invites`, "POST", { hours: 1, maxUses: 1 })).response.status, 201);
    const publicInvite = await api(member, `/api/groups/${groupId}/invites`, "POST", { hours: 1, maxUses: 1 });
    assert.equal(publicInvite.response.status, 201);
    const deletableInvite = await api(owner, `/api/groups/${groupId}/invites`, "POST", { hours: 1, maxUses: 1 });
    assert.equal(deletableInvite.response.status, 201);
    const listedInvites = await api(owner, `/api/groups/${groupId}/admin`);
    const listedInvite = listedInvites.body.invites.find((item) => item.tokenHash);
    assert.ok(listedInvite);
    assert.equal((await api(owner, `/api/groups/${groupId}/invites/${listedInvite.tokenHash}`, "DELETE")).response.status, 200);
  });

  const publicStream = await expectStatus("create public stream", "/api/streams", {
    method: "POST", headers: { cookie: owner.cookie },
    body: JSON.stringify({ roomName: `public-${suffix}`.slice(0, 40), title: "QA Public" }),
  }, 201);
  const publicRoom = publicStream.body.stream.roomName;
  assert.equal(publicStream.body.stream.publicPath, "/qa-channel");
  assert.notEqual(publicStream.body.stream.publicPath, `/${owner.user.username}`);
  await check("public stream visibility, follow and chat history", async () => {
    const stream = publicStream.body.stream;
    assert.equal((await api(null, "/api/streams")).body.streams.some((item) => item.id === stream.id), true);
    assert.equal((await api(member, `/api/streams/${stream.id}/follow`, "POST")).response.status, 200);
    assert.equal((await api(member, "/api/streams?following=1")).body.streams.some((item) => item.id === stream.id), true);
    const host = await openSocket(owner);
    const viewer = await openSocket(null);
    const ownViewer = await openSocket(owner);
    send(host, { type: "join", roomId: publicRoom, role: "host" });
    await waitFor(host, (item) => item.type === "joined" && item.role === "host");
    send(ownViewer, { type: "join", roomId: publicRoom, role: "viewer" });
    await waitFor(ownViewer, (item) => item.type === "error" && item.message.includes("já está transmitindo"));
    send(viewer, { type: "join", roomId: publicRoom, role: "viewer" });
    await waitFor(viewer, (item) => item.type === "host-ready");
    send(viewer, { type: "chat-message", body: "chat QA" });
    const hostChatMessage = await waitFor(host, (item) => item.type === "chat-message" && item.message.body === "chat QA");
    assert.equal(hostChatMessage.message.userId, null, "mensagem anônima do chat recebeu uma conta inexistente");
    const viewerJoined = viewer.messages.find((item) => item.type === "joined" && item.role === "viewer");
    assert.ok(viewerJoined?.clientId, "viewer não recebeu um identificador");
    const listedPublicStream = (await api(null, "/api/streams")).body.streams.find((item) => item.id === stream.id);
    assert.equal(listedPublicStream?.viewerCount, 1, "a listagem pública não refletiu a quantidade de espectadores");
    send(host, { type: "quality-lock", target: viewerJoined.clientId, quality: "economy" });
    await waitFor(viewer, (item) => item.type === "quality-lock" && item.quality === "economy");
    send(host, { type: "signal", target: viewerJoined.clientId, payload: { kind: "invalid", value: "rejeitar" } });
    await waitFor(host, (item) => item.type === "error" && item.message.includes("Sinalização"));
    send(host, { type: "clear-chat" });
    await waitFor(viewer, (item) => item.type === "chat-cleared");
    send(host, { type: "stop" });
    await waitFor(viewer, (item) => item.type === "host-stopped");
    assert.equal((await api(null, "/api/streams")).body.streams.some((item) => item.id === stream.id), false);
    host.socket.close(); viewer.socket.close(); ownViewer.socket.close();
    const followedLive = await expectStatus("create followed live", "/api/streams", {
      method: "POST", headers: { cookie: owner.cookie },
      body: JSON.stringify({ roomName: `followed-${suffix}`.slice(0, 40), title: "QA Followed Live" }),
    }, 201);
    const memberNotifications = await api(member, "/api/notifications");
    const publicLiveNotification = memberNotifications.body.notifications.find((item) => item.type === "channel_live" && item.entityId === followedLive.body.stream.id);
    assert.ok(publicLiveNotification?.actionable && publicLiveNotification.streamPath);
    assert.equal(publicLiveNotification.title, "QA Channel está ao vivo");
    assert.equal(publicLiveNotification.liveContext?.visibility, "public");
    assert.equal(publicLiveNotification.liveContext?.visibilityLabel, "Pública");
    assert.equal(publicLiveNotification.liveContext?.initiatorName, "QA Channel");
    assert.match(publicLiveNotification.body, /Pública/);
    assert.match(publicLiveNotification.body, /canal público/);
    assert.equal((await api(owner, `/api/streams/${followedLive.body.stream.id}/end`, "POST")).response.status, 200);
  });
  await check("private stream scope and HTTP end", async () => {
    const result = await api(owner, "/api/streams", "POST", { roomName: `private-${suffix}`.slice(0, 40), title: "QA Private", visibility: "private", groupId, voiceRoomId: group.voiceOneId });
    assert.equal(result.response.status, 201);
    const stream = result.body.stream;
    assert.ok(stream.publicPath.endsWith("/qa-channel"));
    assert.equal(stream.publicPath.endsWith(`/${owner.user.username}`), false);
    assert.equal((await api(null, "/api/streams")).body.streams.some((item) => item.id === stream.id), false);
    assert.equal((await api(member, "/api/streams")).body.streams.some((item) => item.id === stream.id), false);
    const groupOverview = await api(member, `/api/groups/${groupId}/overview`);
    assert.equal(groupOverview.response.status, 200);
    assert.equal(groupOverview.body.streams.some((item) => item.id === stream.id && item.voiceRoomId === group.voiceOneId), true);
    const privateNotifications = await api(member, "/api/notifications");
    const privateLiveNotification = privateNotifications.body.notifications.find((item) => item.type === "channel_live" && item.entityId === stream.id);
    assert.ok(privateLiveNotification, "a notificação da live privada não foi criada");
    assert.equal(privateLiveNotification.liveContext?.visibility, "private");
    assert.equal(privateLiveNotification.liveContext?.visibilityLabel, "Privada");
    assert.equal(privateLiveNotification.liveContext?.initiatorName, "QA Channel");
    assert.equal(privateLiveNotification.liveContext?.groupName, group.name);
    assert.equal(privateLiveNotification.liveContext?.voiceRoomName, "QA Voice One");
    assert.match(privateLiveNotification.body, new RegExp(group.name));
    assert.match(privateLiveNotification.body, /Privada/);
    assert.equal((await api(guest, "/api/streams")).body.streams.some((item) => item.id === stream.id), false);
    const privatePath = encodeURIComponent(stream.publicPath);
    assert.equal((await api(null, `/api/streams/resolve?path=${privatePath}`)).response.status, 404);
    assert.equal((await api(guest, `/api/streams/resolve?path=${privatePath}`)).response.status, 404);
    assert.equal((await api(member, `/api/streams/resolve?path=${privatePath}`)).response.status, 200);
    const end = await api(owner, `/api/streams/${stream.id}/end`, "POST");
    assert.equal(end.response.status, 200);
    const repeatedEnd = await api(owner, `/api/streams/${stream.id}/end`, "POST");
    assert.equal(repeatedEnd.response.status, 200);
    assert.equal(repeatedEnd.body.alreadyEnded, true);
  });

  await check("voice join, server mute, move and disconnect", async () => {
    const first = await openSocket(owner);
    const second = await openSocket(member);
    send(first, { type: "voice-join", groupId, voiceRoomId: group.voiceOneId });
    const firstJoined = await waitFor(first, (item) => item.type === "voice-joined");
    send(second, { type: "voice-join", groupId, voiceRoomId: group.voiceOneId });
    await waitFor(second, (item) => item.type === "voice-joined");
    const memberJoined = await waitFor(first, (item) => item.type === "voice-user-joined" && item.participant.userId === member.user.id);
    const third = await openSocket(outsider);
    send(third, { type: "voice-join", groupId, voiceRoomId: group.voiceOneId });
    const roomFull = await waitFor(third, (item) => item.type === "voice-error");
    assert.match(roomFull.message, /limite de 2 participantes/);
    third.socket.close();
    send(second, { type: "voice-speaking", speaking: true });
    await waitFor(first, (item) => item.type === "voice-user-speaking" && item.participantId === memberJoined.participant.id && item.speaking === true);
    send(second, { type: "voice-speaking", speaking: false });
    await waitFor(first, (item) => item.type === "voice-user-speaking" && item.participantId === memberJoined.participant.id && item.speaking === false);
    send(first, { type: "voice-mute", participantId: memberJoined.participant.id });
    await waitFor(second, (item) => item.type === "voice-force-mute" && item.muted === true);
    await waitFor(first, (item) => item.type === "voice-user-muted" && item.participantId === memberJoined.participant.id && item.muted === true);
    send(second, { type: "voice-deafen-state", deafened: true });
    await waitFor(first, (item) => item.type === "voice-user-deafened" && item.participantId === memberJoined.participant.id && item.deafened === true);
    send(first, { type: "voice-move", participantId: memberJoined.participant.id, targetRoomId: group.voiceTwoId });
    await waitFor(second, (item) => item.type === "voice-moved" && item.voiceRoomId === group.voiceTwoId);
    const targetAdmin = await openSocket(owner);
    send(targetAdmin, { type: "voice-join", groupId, voiceRoomId: group.voiceTwoId });
    const targetJoined = await waitFor(targetAdmin, (item) => item.type === "voice-joined" && item.voiceRoomId === group.voiceTwoId);
    await waitFor(first, (item) => item.type === "voice-disconnected" && item.reason === "replaced");
    const moved = targetJoined.participants.find((item) => item.userId === member.user.id);
    assert.ok(moved, "membro movido não apareceu na sala de destino");
    assert.equal(moved.muted, true, "estado de microfone não persistiu ao mover o membro");
    assert.equal(moved.deafened, true, "estado de áudio não persistiu ao mover o membro");
    send(targetAdmin, { type: "voice-disconnect", participantId: moved.id });
    await waitFor(second, (item) => item.type === "voice-disconnected");
    send(targetAdmin, { type: "voice-leave" });
    send(first, { type: "voice-leave" });
    first.socket.close(); second.socket.close(); targetAdmin.socket.close();

    const duplicateFirst = await openSocket(owner);
    const duplicateSecond = await openSocket(owner);
    send(duplicateFirst, { type: "voice-join", groupId, voiceRoomId: group.voiceOneId });
    await waitFor(duplicateFirst, (item) => item.type === "voice-joined");
    send(duplicateSecond, { type: "voice-join", groupId, voiceRoomId: group.voiceOneId });
    const replaced = await waitFor(duplicateFirst, (item) => item.type === "voice-disconnected" && item.message.includes("substituída"));
    assert.equal(replaced.reason, "replaced");
    const replacementJoined = await waitFor(duplicateSecond, (item) => item.type === "voice-joined");
    assert.equal(replacementJoined.participants.filter((item) => item.userId === owner.user.id).length, 0, "a nova sessão recebeu a presença antiga do mesmo usuário");
    duplicateFirst.socket.close(); duplicateSecond.socket.close();
  });

  await check("non-owner cannot end another stream", async () => {
    const result = await api(owner, "/api/streams", "POST", { roomName: `public2-${suffix}`.slice(0, 40), title: "QA Public 2" });
    assert.equal(result.response.status, 201);
    assert.equal((await api(member, `/api/streams/${result.body.stream.id}/end`, "POST")).response.status, 403);
    assert.equal((await api(owner, `/api/streams/${result.body.stream.id}/end`, "POST")).response.status, 200);
  });

  await check("notifications read all", async () => {
    assert.equal((await api(owner, "/api/notifications/read-all", "POST")).response.status, 200);
    assert.equal((await api(owner, "/api/notifications")).body.unreadCount, 0);
  });

  await check("member can leave group", async () => {
    const result = await api(member, `/api/groups/${groupId}/membership`, "DELETE");
    assert.equal(result.response.status, 200);
    assert.equal((await api(member, `/api/groups/${groupId}/overview`)).response.status, 403);
    assert.equal((await api(member, "/api/groups")).body.groups.some((item) => item.id === groupId), false);
    assert.equal((await api(owner, `/api/groups/${groupId}/membership`, "DELETE")).response.status, 400);
  });
}

main().catch((error) => failures.push(`fatal: ${error.message}`)).finally(() => {
  for (const connection of sockets) { try { connection.close(); } catch {} }
  const total = passed + failures.length;
  console.log(JSON.stringify({ passed, total, failures }));
  process.exit(failures.length ? 1 : 0);
});
