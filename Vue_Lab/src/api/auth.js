import request from '../utils/request'

export function loginApi(data) {
  return request({
    url: '/lab/auth/login',
    method: 'post',
    data,
  })
}

export function registerApi(data) {
  return request({
    url: '/lab/auth/register',
    method: 'post',
    data,
  })
}

export function logoutApi() {
  return request({
    url: '/lab/auth/logout',
    method: 'post',
  })
}

export function resetPasswordByOldPasswordApi(data) {
  return request({
    url: '/lab/auth/password/reset-by-old-password',
    method: 'put',
    data,
  })
}

