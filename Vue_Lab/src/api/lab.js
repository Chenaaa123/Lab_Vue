import request from '../utils/request'

export function listLabsApi(params) {
  return request({
    url: '/lab/labs',
    method: 'get',
    params,
  })
}

export function getLabDetailApi(id) {
  return request({
    url: `/lab/labs/${id}`,
    method: 'get',
  })
}

export function createLabApi(data) {
  return request({
    url: '/lab/labs',
    method: 'post',
    data,
  })
}

export function updateLabApi(id, data) {
  return request({
    url: `/lab/labs/${id}`,
    method: 'put',
    data,
  })
}

export function deleteLabApi(id) {
  return request({
    url: `/lab/labs/${id}`,
    method: 'delete',
  })
}

export function listLabsByCategoryApi(categoryId) {
  return request({
    url: '/lab/labs',
    method: 'get',
    params: { categoryId },
  })
}

/** 按实验室管理员查询其管辖的实验室（原 GET /lab/labs/admin/{id}） */
export function listLabsByManagerApi(managerId, params) {
  return request({
    url: `/lab/labs/manager/${managerId}`,
    method: 'get',
    params,
  })
}

