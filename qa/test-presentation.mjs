import assert from "node:assert/strict";
import { compactAvatarData, compactUserSummary, MAX_INLINE_AVATAR_LENGTH } from "../server/shared/presentation.mjs";

const accepted = "data:image/png;base64," + "a".repeat(MAX_INLINE_AVATAR_LENGTH - 22);
const oversized = "x".repeat(MAX_INLINE_AVATAR_LENGTH + 1);
assert.equal(compactAvatarData(accepted), accepted);
assert.equal(compactAvatarData(oversized), null);
assert.equal(compactAvatarData(""), null);
assert.equal(compactAvatarData(null), null);

const user = { id: "user-1", username: "ana", avatarData: oversized, extra: "preserved" };
const summary = compactUserSummary(user);
assert.deepEqual(summary, { id: "user-1", username: "ana", avatarData: null, extra: "preserved" });
assert.equal(user.avatarData, oversized);
assert.equal(compactUserSummary(null), null);

console.log(JSON.stringify({ ok: true, maxInlineAvatarLength: MAX_INLINE_AVATAR_LENGTH, summaryPreserved: true }));
