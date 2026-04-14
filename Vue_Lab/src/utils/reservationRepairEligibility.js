/**
 * 与后端 POST /lab/reservations/{id}/repair 前置条件一致：
 * - 预约 status = 1（已通过）
 * - 使用已结束：useStatusCode/useStatus 为 2，或 endTime 早于当前时间
 */

function parseEndTime(v) {
  if (!v) return null
  const s = String(v).replace(/\.\d+$/, '').trim()
  const d = new Date(s)
  // eslint-disable-next-line no-restricted-globals
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * @param {Record<string, unknown>} row 预约列表行（含 status、useStatusCode、endTime、useStatusNumeric 等）
 */
export function isReservationEligibleForRepair(row) {
  if (Number(row?.status) !== 1) return false

  const code = row?.useStatusCode
  if (code === 2 || code === '2') return true

  const n = Number(row?.useStatusNumeric)
  if (Number.isFinite(n) && n === 2) return true

  const end = parseEndTime(row?.endTime)
  return !!(end && Date.now() > end.getTime())
}
