CREATE TABLE IF NOT EXISTS group_room_permissions (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES group_roles(id) ON DELETE CASCADE,
  can_view INTEGER NOT NULL DEFAULT 1,
  can_chat INTEGER NOT NULL DEFAULT 1,
  can_connect INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, room_id, role_id)
);
CREATE INDEX IF NOT EXISTS group_room_permissions_room_idx ON group_room_permissions(group_id, room_id);
