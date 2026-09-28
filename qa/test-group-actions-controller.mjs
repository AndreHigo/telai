import assert from "node:assert/strict";
import { createGroupActionsController } from "../frontend/src/features/groups/actions-controller.js";

const updates = [];
const apiCalls = [];
const fakeWindow = { innerWidth: 1000, innerHeight: 700, location: { origin: "https://telai.test" }, confirm: () => true };
const fakeDocument = { querySelector: () => ({ focus() {} }) };
let state = {
  selectedGroupId: "group-1",
  selectedGroup: { id: "group-1", role: "owner", name: "QA" },
  selectedRole: { id: "role-1", name: "Moderador", canSendMessages: true },
  selectedRoleId: "role-1",
  selectedRoomId: "room-1",
  groupSettingsName: "Novo nome",
  groups: [{ id: "group-1", name: "QA", slug: "qa" }],
  groupOverview: { group: { id: "group-1", name: "QA" }, members: [], messages: [] },
  groupRoles: [{ id: "role-default", name: "Membro", isDefault: true }],
  rolePermissionOptions: [{ key: "canSendMessages", label: "Enviar mensagens" }],
  newRoleName: "",
  newRoleColor: "#fff",
  roleEditName: "Moderador",
  roleEditColor: "#fff",
  roleEditBusy: false,
  roleMemberActionId: "",
  groupInviteCreating: false,
  groupInviteLink: "",
  groupInvites: [],
  groupInviteBusyId: "",
  groupAdminError: "",
  groupContextMenu: null,
  roomContextMenu: null,
  roomDialogMode: "create",
  deleteGroupBusy: false,
  deleteGroupError: "",
  showDeleteGroupDialog: false,
  knownGroupMessageIds: new Set(),
  voiceState: "idle",
  voiceRoomId: null,
  voiceRooms: [],
};

const controller = createGroupActionsController({
  getState: () => state,
  setState: (next) => { updates.push(next); state = { ...state, ...next }; },
  api: async (path, options) => {
    apiCalls.push({ path, options });
    if (path.endsWith("/invites")) return { token: "invite-token" };
    if (options?.method === "PATCH") return { group: { id: "group-1", name: "Novo nome", slug: "novo-nome" } };
    return {};
  },
  copyText: async () => true,
  loadGroupAdministration: async () => updates.push({ administrationLoaded: true }),
  loadGroup: async () => {},
  selectRoom: async () => {},
  setGroupsView: () => {},
  openInviteDialog: () => {},
  openSettings: () => {},
  openLeaveGroupDialog: () => {},
  closeVoiceContextMenu: () => {},
  markGroupRoomRead: async () => {},
  messageBelongsToRoom: () => false,
  tick: async () => {},
  windowRef: fakeWindow,
  documentRef: fakeDocument,
});

await controller.saveGroupSettings();
assert.equal(state.groups[0].name, "Novo nome");
assert.equal(apiCalls[0].path, "/api/groups/group-1");

await controller.createGroupInvite();
assert.equal(state.groupInviteLink, "https://telai.test/?invite=invite-token");
assert.ok(updates.some((update) => update.administrationLoaded));

controller.openGroupContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 980, clientY: 690 }, state.groups[0]);
assert.equal(state.groupContextMenu.x, 748);
assert.equal(state.groupContextMenu.y, 406);
controller.closeGroupContextMenu();
assert.equal(state.groupContextMenu, null);

console.log("group actions controller: ok");
