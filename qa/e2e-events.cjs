const assert = require("node:assert/strict");
const { WebSocket } = require("ws");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-events-${process.pid}-${Date.now()}.sqlite`);
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body, cookie: response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0] || "" };
}

async function register(baseUrl, username) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName: username, password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return { cookie: result.cookie, user: result.body.user };
}

function openEvents(baseUrl, session) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/events`, session?.cookie ? { headers: { Cookie: session.cookie } } : undefined);
    const messages = [];
    let opened = false;
    socket.on("open", () => { opened = true; resolve({ socket, messages }); });
    socket.on("message", (raw) => { try { messages.push(JSON.parse(raw.toString())); } catch {} });
    socket.on("error", (error) => { if (!opened) reject(error); });
  });
}

async function waitFor(connection, predicate, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = connection.messages.find(predicate);
    if (result) return result;
    await sleep(20);
  }
  throw new Error(`evento não recebido: ${JSON.stringify(connection.messages.slice(-8))}`);
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}${process.pid}`;
  const sockets = [];
  try {
    const anonymousEvents = await openEvents(baseUrl);
    sockets.push(anonymousEvents.socket);
    const unauthorized = await waitFor(anonymousEvents, (message) => message.type === "events-error");
    assert.equal(unauthorized.code, "unauthorized");
    const owner = await register(baseUrl, `qa_events_owner_${suffix}`.slice(0, 32));
    const member = await register(baseUrl, `qa_events_member_${suffix}`.slice(0, 32));
    const groupResult = await request(baseUrl, "/api/groups", {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ name: `QA Events ${suffix}`, slug: `qa-events-${suffix}`.slice(0, 64) }),
    });
    assert.equal(groupResult.response.status, 201, JSON.stringify(groupResult.body));
    const groupId = groupResult.body.group.id;
    const joinRequest = await request(baseUrl, `/api/groups/${groupId}/join-requests`, { method: "POST", headers: { cookie: member.cookie } });
    assert.equal(joinRequest.response.status, 201, JSON.stringify(joinRequest.body));
    const decision = await request(baseUrl, `/api/groups/${groupId}/join-requests/${joinRequest.body.request.id}`, {
      method: "PATCH",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(decision.response.status, 200, JSON.stringify(decision.body));
    const overview = await request(baseUrl, `/api/groups/${groupId}/overview`, { headers: { cookie: owner.cookie } });
    const textRoom = overview.body.rooms.find((room) => room.kind === "text");
    assert.ok(textRoom, "o grupo não possui sala de texto para o teste");

    const ownerEvents = await openEvents(baseUrl, owner);
    const memberEvents = await openEvents(baseUrl, member);
    sockets.push(ownerEvents.socket, memberEvents.socket);
    ownerEvents.socket.send(JSON.stringify({ type: "subscribe-group", groupId }));
    memberEvents.socket.send(JSON.stringify({ type: "subscribe-group", groupId }));
    await waitFor(ownerEvents, (message) => message.type === "group-subscribed" && message.groupId === groupId);
    await waitFor(memberEvents, (message) => message.type === "group-subscribed" && message.groupId === groupId);

    const admin = await request(baseUrl, `/api/groups/${groupId}/admin`, { headers: { cookie: owner.cookie } });
    const defaultRole = admin.body.roles.find((role) => role.isDefault);
    assert.ok(defaultRole, "cargo padrão não encontrado");
    const hiddenPermission = await request(baseUrl, `/api/groups/${groupId}/rooms/${textRoom.id}/permissions`, {
      method: "PATCH",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ roleId: defaultRole.id, canView: false, canChat: false, canConnect: false }),
    });
    assert.equal(hiddenPermission.response.status, 200, JSON.stringify(hiddenPermission.body));
    const hiddenMessage = await request(baseUrl, `/api/groups/${groupId}/messages`, {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ roomId: textRoom.id, body: "evento privado" }),
    });
    assert.equal(hiddenMessage.response.status, 201);
    await sleep(250);
    assert.equal(memberEvents.messages.some((message) => message.message?.id === hiddenMessage.body.message.id), false, "evento de canal oculto vazou");
    const resetHiddenPermission = await request(baseUrl, `/api/groups/${groupId}/rooms/${textRoom.id}/permissions?roleId=${encodeURIComponent(defaultRole.id)}`, {
      method: "DELETE",
      headers: { cookie: owner.cookie },
    });
    assert.equal(resetHiddenPermission.response.status, 200);
    const permissionsAfterReset = await request(baseUrl, `/api/groups/${groupId}/rooms/${textRoom.id}/permissions`, { headers: { cookie: owner.cookie } });
    assert.equal(permissionsAfterReset.body.permissions.length, 0, JSON.stringify(permissionsAfterReset.body));
    const memberOverviewAfterReset = await request(baseUrl, `/api/groups/${groupId}/overview`, { headers: { cookie: member.cookie } });
    assert.equal(memberOverviewAfterReset.response.status, 200);
    assert.equal(memberOverviewAfterReset.body.rooms.some((room) => room.id === textRoom.id), true);

    const createdMessage = await request(baseUrl, `/api/groups/${groupId}/messages`, {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ roomId: textRoom.id, body: "evento de grupo" }),
    });
    assert.equal(createdMessage.response.status, 201, JSON.stringify(createdMessage.body));
    const eventMessage = await waitFor(memberEvents, (message) => message.type === "group-message" && message.message?.id === createdMessage.body.message.id);
    assert.equal(eventMessage.message.body, "evento de grupo");

    const updatedMessage = await request(baseUrl, `/api/groups/${groupId}/messages/${createdMessage.body.message.id}`, {
      method: "PATCH",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ body: "evento de grupo editado" }),
    });
    assert.equal(updatedMessage.response.status, 200, JSON.stringify(updatedMessage.body));
    const eventUpdate = await waitFor(memberEvents, (message) => message.type === "group-message-updated" && message.message?.id === createdMessage.body.message.id);
    assert.equal(eventUpdate.message.body, "evento de grupo editado");

    const deletedMessage = await request(baseUrl, `/api/groups/${groupId}/messages/${createdMessage.body.message.id}`, {
      method: "DELETE",
      headers: { cookie: owner.cookie },
    });
    assert.equal(deletedMessage.response.status, 200, JSON.stringify(deletedMessage.body));
    const eventDelete = await waitFor(memberEvents, (message) => message.type === "group-message-deleted" && message.messageId === createdMessage.body.message.id);
    assert.equal(eventDelete.messageId, createdMessage.body.message.id);

    memberEvents.socket.send(JSON.stringify({ type: "group-presence", groupId }));
    const presence = await waitFor(ownerEvents, (message) => message.type === "group-presence" && message.groupId === groupId && message.members?.some((item) => item.id === member.user.id && item.online));
    assert.equal(presence.members.find((item) => item.id === member.user.id).online, true);

    const reducedOverview = await request(baseUrl, `/api/groups/${groupId}/overview?includeMessages=0`, { headers: { cookie: owner.cookie } });
    assert.equal(reducedOverview.response.status, 200);
    assert.equal(Object.hasOwn(reducedOverview.body, "messages"), false, "overview reduzido ainda transportou mensagens");
    console.log(JSON.stringify({ ok: true, separateEventsGateway: true, groupMessageDelivered: true, groupMessageMutationsDelivered: true, presenceDelivered: true, overviewWithoutMessages: true }));
  } finally {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
