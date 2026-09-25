export const MAX_INLINE_AVATAR_LENGTH = 128 * 1024;

export function compactAvatarData(value) {
  const avatarData = String(value || "");
  return avatarData && avatarData.length <= MAX_INLINE_AVATAR_LENGTH ? avatarData : null;
}

export function compactUserSummary(user) {
  return user ? { ...user, avatarData: compactAvatarData(user.avatarData) } : user;
}
