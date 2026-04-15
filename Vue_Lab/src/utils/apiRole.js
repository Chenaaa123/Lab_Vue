/**
 * 将登录态中的中文角色转为列表类接口要求的 role 参数（与后端约定一致）
 */
export function toListApiRole(uiRole) {
  const r = String(uiRole ?? '').trim()
  if (r === 'system_admin' || r === 'lab_admin' || r === 'teacher' || r === 'student') return r
  if (r === '系统管理员') return 'system_admin'
  if (r === '实验室管理员') return 'lab_admin'
  if (r === '老师' || r === '教师') return 'teacher'
  if (r === '学生') return 'student'
  return 'student'
}

/**
 * 与预约报修 POST /lab/reservations/{id}/repair 的 role 归一化一致（含中文角色名）
 * @param {string} uiRole localStorage / userInfo 中的角色展示文案或已有英文码
 */
export function normalizeReservationRole(uiRole) {
  return toListApiRole(uiRole)
}
