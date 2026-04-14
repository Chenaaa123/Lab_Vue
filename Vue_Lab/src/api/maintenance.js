import request from '../utils/request'
import { serializeListQuery } from '../utils/listQuerySerialize'

/**
 * 分页查询检修记录
 * 常用 query：page、size、userId、role、labId、status、labIds（实验室管理员范围）
 * 按报修人筛选（可选）：reporterUserId（优先）；reporterId 同义兼容，二者同时传时以后端以 reporterUserId 为准
 * — 仅返回关联报修单且 repair.user.userId 匹配的检修记录
 */
export function listMaintenancesApi(params) {
  return request({
    url: '/lab/maintenances',
    method: 'get',
    params,
    paramsSerializer: serializeListQuery,
  })
}

/** 检修详情 */
export function getMaintenanceDetailApi(id) {
  return request({
    url: `/lab/maintenances/${id}`,
    method: 'get',
  })
}

/** 创建检修：repairId 必填；handlerId、result 可选；报修 status 置为 1 处理中 */
export function createMaintenanceApi(data) {
  return request({
    url: '/lab/maintenances',
    method: 'post',
    data,
  })
}

/** 更新检修：status=1 时完成检修，关联报修置为 2 已完成 */
export function updateMaintenanceApi(id, data) {
  return request({
    url: `/lab/maintenances/${id}`,
    method: 'put',
    data,
  })
}
