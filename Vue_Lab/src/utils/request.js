import axios from 'axios'

/**
 * 从响应体对象上读取分页 total（兼容多种字段名）
 * @param {object|null|undefined} obj
 * @returns {number|null}
 */
function readTotalFromObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const keys = ['total', 'totalCount', 'totalElements', 'totalRecords', 'count']
  for (const k of keys) {
    if (obj[k] == null || obj[k] === '') continue
    const n = Number(obj[k])
    if (!Number.isNaN(n) && n >= 0) return n
  }
  return null
}

/**
 * 兼容后端：total 在「外层信封」上，而 data 仅为当前页数组；
 * 或 data 为 { records/list/content } 但 total 只在外层。
 * 统一成带 records + total 的对象，避免分页条数误判为当前页长度。
 *
 * @param {object} envelope axios 收到的 response.data（含 code、data、total 等）
 */
function normalizePagedPayload(envelope) {
  if (!envelope || typeof envelope !== 'object') return envelope

  const inner = envelope.data !== undefined ? envelope.data : envelope

  // ① data 直接是数组：必须用信封上的 total，不能用数组 length 当总条数
  if (Array.isArray(inner)) {
    const total = readTotalFromObject(envelope) ?? inner.length
    return { records: inner, list: inner, total }
  }

  // ② data 为分页对象（records / list / content）
  if (inner && typeof inner === 'object') {
    const rows = inner.records ?? inner.list ?? inner.content ?? inner.items
    if (Array.isArray(rows)) {
      const fromInner = readTotalFromObject(inner)
      const fromEnvelope = readTotalFromObject(envelope)
      const total = fromInner ?? fromEnvelope ?? rows.length
      return {
        ...inner,
        records: rows,
        total,
      }
    }
  }

  return inner
}

const service = axios.create({
  baseURL: 'http://localhost:8080',
  timeout: 10000,
  withCredentials: true,
})

service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // 兼容后端：如果后端用 userId/role 做鉴权，这里统一附带
    const raw = localStorage.getItem('userInfo')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed?.userId) {
          config.headers['X-User-Id'] = String(parsed.userId)
        }

        // 注意：浏览器 XHR/fetch 的 header value 不能包含中文等非 ISO-8859-1 字符
        // 所以不要直接传 “系统管理员/学生/老师...” 这类中文到 header。
        // 后端公告模块约定：X-Role=Admin 或 X-Role=管理员 才允许管理操作
        // 这里仅将“系统管理员”映射为 ASCII 的 Admin。
        if (parsed?.role === '系统管理员') {
          config.headers['X-Role'] = 'Admin'
        }
      } catch {
        // ignore
      }
    }
    return config
  },
  (error) => Promise.reject(error),
)

service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 兼容后端两种成功码：0 或 200
    // - code=0, msg=success
    // - code=200, message=success
    if (
      res &&
      typeof res.code !== 'undefined' &&
      res.code !== 0 &&
      res.code !== 200
    ) {
      throw new Error(res.msg || res.message || '请求失败')
    }

    // 标准封装 { code, data, ... }：经 normalize 合并信封上的 total（data 为数组时尤其重要）
    if (
      res &&
      typeof res === 'object' &&
      !Array.isArray(res) &&
      Object.prototype.hasOwnProperty.call(res, 'data')
    ) {
      return normalizePagedPayload(res)
    }
    // 无 data 包装时保持原逻辑
    return res?.data !== undefined ? res.data : res
  },
  (error) => {
    return Promise.reject(error)
  },
)

export default service

