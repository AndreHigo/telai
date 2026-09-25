ALTER TABLE application_group_installations ADD COLUMN IF NOT EXISTS allow_commands BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE application_group_installations ADD COLUMN IF NOT EXISTS allow_messages BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE application_group_installations ADD COLUMN IF NOT EXISTS allow_interactions BOOLEAN NOT NULL DEFAULT TRUE;
