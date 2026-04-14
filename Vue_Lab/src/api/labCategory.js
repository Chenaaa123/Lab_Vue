import request from '../utils/request'

export function listLabCategoriesApi() {
  return request({
    url: '/lab/lab-categories',
    method: 'get',
  })
}

export function getLabCategoryApi(id) {
  return request({
    url: `/lab/lab-categories/${id}`,
    method: 'get',
  })
}

export function createLabCategoryApi(data) {
  return request({
    url: '/lab/lab-categories',
    method: 'post',
    data,
  })
}

export function updateLabCategoryApi(id, data) {
  return request({
    url: `/lab/lab-categories/${id}`,
    method: 'put',
    data,
  })
}

export function deleteLabCategoryApi(id) {
  return request({
    url: `/lab/lab-categories/${id}`,
    method: 'delete',
  })
}

/** body 需含 managerUserId；多数后端还要求 adminUserId（当前系统管理员） */
export function assignLabCategoryManagerApi(id, payload) {
  return request({
    url: `/lab/lab-categories/${id}/manager`,
    method: 'put',
    data: payload,
  })
}

export function getManagerNameApi(managerId) {
  return request({
    url: `/lab/lab-categories/manager/${managerId}/name`,
    method: 'get',
  })
}

