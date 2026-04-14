import request from '../utils/request'

// 当前登录用户
export function getProfileApi(userId) {
  return request({
    url: '/lab/users/profile',
    method: 'get',
    params: { userId },
  })
}

export function updateProfileApi(userId, data) {
  return request({
    url: '/lab/users/profile',
    method: 'put',
    data: {
      userId,
      ...data,
    },
  })
}

export function changePasswordApi(userId, data) {
  return request({
    url: '/lab/users/password',
    method: 'put',
    data: {
      userId,
      ...data,
    },
  })
}

// 管理员：用户列表与管理
export function listUsersApi(params) {
  return request({
    url: '/lab/users',
    method: 'get',
    params,
  })
}

export function createUserApi(data) {
  return request({
    url: '/lab/users',
    method: 'post',
    data,
  })
}

export function updateUserApi(id, data) {
  return request({
    url: `/lab/users/${id}`,
    method: 'put',
    data,
  })
}

export function deleteUserApi(id) {
  return request({
    url: `/lab/users/${id}`,
    method: 'delete',
  })
}

export function updateUserStatusApi(id, enabled) {
  return request({
    url: `/lab/users/${id}/status`,
    method: 'put',
    data: { enabled },
  })
}

export function resetUserPasswordApi(id) {
  return request({
    url: `/lab/users/${id}/password/reset`,
    method: 'put',
  })
}

