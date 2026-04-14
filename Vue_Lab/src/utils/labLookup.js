/**
 * 从接口/行对象上取实验室主键（兼容驼峰、蛇形、嵌套 lab）
 */
export function extractLabId(source) {
  if (!source || typeof source !== 'object') return undefined
  return (
    source.labId ??
    source.lab_id ??
    source.laboratoryId ??
    source.lab?.id ??
    source.lab?.labId
  )
}

/**
 * 在实验室列表中按 id / labId 查找（字符串比较，避免 number/string 不一致）
 * labId 为空时不查找：若用 `l.labId === undefined` 会误匹配列表里未定义 labId 的第一条
 */
export function findLabById(labs, labId) {
  if (labId == null || labId === '') return undefined
  const s = String(labId)
  const list = Array.isArray(labs) ? labs : []
  return list.find(
    (l) => String(l.id ?? '') === s || String(l.labId ?? '') === s,
  )
}

/**
 * 实验室列表/详情上的「实验室管理员」用户 ID（新接口：manager_id 嵌套用户；末尾兼容旧 admin 字段）
 */
export function resolveLabManagerUserId(row) {
  if (!row || typeof row !== 'object') return undefined
  return (
    row.managerUserId ??
    row.managerId ??
    (typeof row.manager_id === 'number' || typeof row.manager_id === 'string'
      ? row.manager_id
      : undefined) ??
    row.manager_id?.userId ??
    row.manager_id?.id ??
    row.manager?.userId ??
    row.manager?.id ??
    row.adminUserId ??
    row.admin_id ??
    row.admin?.userId ??
    row.admin?.id
  )
}
