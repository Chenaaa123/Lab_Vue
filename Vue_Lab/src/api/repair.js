import request from '../utils/request'
import { serializeListQuery } from '../utils/listQuerySerialize'

/** 分页查询报修记录 */
export function listRepairsApi(params) {
  return request({
    url: '/lab/repairs',
    method: 'get',
    params,
    paramsSerializer: serializeListQuery,
  })
}

/** 报修详情 */
export function getRepairDetailApi(id) {
  return request({
    url: `/lab/repairs/${id}`,
    method: 'get',
  })
}

/** 创建报修：userId、labId、title 必填；description、reservationId 可选 */
export function createRepairApi(data) {
  return request({
    url: '/lab/repairs',
    method: 'post',
    data,
  })
}
