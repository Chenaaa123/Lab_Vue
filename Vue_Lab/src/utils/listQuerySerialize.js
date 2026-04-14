/**
 * GET 查询序列化：labIds 数组序列化为逗号分隔（labIds=1,2,3），其余标量照常
 */
export function serializeListQuery(params) {
  if (!params || typeof params !== 'object') return ''
  const parts = []
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === '') continue
    if (key === 'labIds' && Array.isArray(val)) {
      const joined = val
        .filter((item) => item !== undefined && item !== null && item !== '')
        .map((item) => String(item))
        .join(',')
      if (joined) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(joined)}`)
      continue
    }
    if (Array.isArray(val)) {
      val.forEach((item) => {
        if (item === undefined || item === null || item === '') return
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
      })
      continue
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`)
  }
  return parts.join('&')
}
