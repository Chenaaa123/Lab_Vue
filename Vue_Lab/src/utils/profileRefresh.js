/**
 * 个人资料变更通知（用于侧栏/头部立刻刷新昵称、头像等）
 */
export const USER_PROFILE_UPDATED_EVENT = 'user:profile-updated'

/**
 * @param {{ userName?: string, avatar?: string, avatarUrl?: string, role?: string, roleName?: string, role_code?: string, userAccount?: string }} patch
 */
export function notifyUserProfileUpdated(patch) {
  window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATED_EVENT, { detail: patch || {} }))
}

/** @param {(patch: any) => void} handler */
export function subscribeUserProfileUpdated(handler) {
  const fn = (e) => handler?.(e.detail || {})
  window.addEventListener(USER_PROFILE_UPDATED_EVENT, fn)
  return () => window.removeEventListener(USER_PROFILE_UPDATED_EVENT, fn)
}

