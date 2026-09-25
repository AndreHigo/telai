CREATE TABLE IF NOT EXISTS group_room_reads (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_key TEXT NOT NULL,
  room_id TEXT REFERENCES group_rooms(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id, room_key)
);
CREATE INDEX IF NOT EXISTS group_room_reads_user_idx ON group_room_reads(group_id, user_id, read_at DESC);
