import request from '../utils/request'
import { serializeListQuery } from '../utils/listQuerySerialize'

export function listReservationsApi(params) {
  return request({
    url: '/lab/reservations',
    method: 'get',
    params,
    paramsSerializer: serializeListQuery,
  })
}

export function createReservationApi(data) {
  return request({
    url: '/lab/reservations',
    method: 'post',
    data,
  })
}

export function getReservationDetailApi(id) {
  return request({
    url: `/lab/reservations/${id}`,
    method: 'get',
  })
}

export function auditReservationApi(id, data) {
  return request({
    url: `/lab/reservations/${id}/audit`,
    method: 'put',
    data,
  })
}

export function cancelReservationApi(id) {
  return request({
    url: `/lab/reservations/${id}/cancel`,
    method: 'put',
    data: {},
  })
}

/** 使用完成：status=1 时用户可提前结束，释放实验室 */
export function finishReservationApi(id) {
  return request({
    url: `/lab/reservations/${id}/finish`,
    method: 'put',
    data: {},
  })
}

/**
 * 故障报修：使用结束后创建报修记录
 * 请求体须非空；userId、role 必填（role：system_admin | lab_admin | teacher | student，与列表接口一致）
 */
export function repairReservationApi(id, data) {
  return request({
    url: `/lab/reservations/${id}/repair`,
    method: 'post',
    data,
  })
}
