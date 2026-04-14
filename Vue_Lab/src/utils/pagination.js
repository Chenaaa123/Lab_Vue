/**
 * 从后端分页响应中解析「总条数」（兼容常见字段名）。
 * 注意：若接口未返回 total，仅用当前页条数兜底会不准确，调用方应优先保证后端返回 total。
 *
 * @param {object|Array|null|undefined} data 接口返回体（axios 拦截器解包后的对象）
 * @param {number} fallback 无法解析时的兜底值
 * @returns {number}
 */
export function extractPagedTotal(data, fallback = 0) {
  if (data == null) return fallback
  if (Array.isArray(data)) return fallback
  if (typeof data !== 'object') return fallback

  const keys = [
    'total',
    'totalCount',
    'totalElements',
    'totalRecords',
    'recordCount',
    'count',
  ]
  const tryRead = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    for (const k of keys) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue
      const v = obj[k]
      if (v === undefined || v === null || v === '') continue
      const n = Number(v)
      if (!Number.isNaN(n) && n >= 0) return n
    }
    return null
  }

  const direct = tryRead(data)
  if (direct != null) return direct

  // Spring Data Page 嵌套：{ page: { totalElements } }
  const nested = data.page
  if (nested && typeof nested === 'object') {
    const n = tryRead(nested)
    if (n != null) return n
  }

  return fallback
}
