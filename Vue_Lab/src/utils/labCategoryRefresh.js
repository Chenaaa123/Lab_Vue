/**
 * 分类管理员变更、或实验室增删改后，其它页面内存中的列表仍是旧请求结果；
 * 通过自定义事件通知各页重拉 GET /lab/labs（或详情）。
 */

export const LAB_CATEGORY_LABS_STALE_EVENT = 'lab:category-labs-stale'

/**
 * @param {number|string|null|undefined} categoryId 相关分类 id；与具体分类无关时传 null（监听方通常仍会全量 refetch）
 */
export function notifyLabsStaleForCategory(categoryId) {
  const n = categoryId != null && categoryId !== '' ? Number(categoryId) : null
  const id = Number.isFinite(n) ? n : null
  window.dispatchEvent(
    new CustomEvent(LAB_CATEGORY_LABS_STALE_EVENT, { detail: { categoryId: id } }),
  )
}

/** @param {(categoryId: number|null) => void} handler */
export function subscribeLabsStaleForCategory(handler) {
  const fn = (e) => handler(e.detail?.categoryId ?? null)
  window.addEventListener(LAB_CATEGORY_LABS_STALE_EVENT, fn)
  return () => window.removeEventListener(LAB_CATEGORY_LABS_STALE_EVENT, fn)
}

/**
 * 列表带 categoryId 筛选时：仅当与失效分类一致时重拉；未筛选则展示多分类数据，需重拉。
 */
export function shouldRefetchLabsForCurrentFilter(selectedCategoryId, staleCategoryId) {
  if (staleCategoryId == null) return true
  if (selectedCategoryId == null || selectedCategoryId === '') return true
  return Number(selectedCategoryId) === Number(staleCategoryId)
}
