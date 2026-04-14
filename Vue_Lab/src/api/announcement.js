import request from '../utils/request'

function getCurrentUserId() {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed?.userId ?? null
  } catch {
    return null
  }
}

export function listAnnouncementsApi(params) {
  return request({
    url: '/lab/announcements',
    method: 'get',
    params,
  })
}

export function getAnnouncementApi(id) {
  return request({
    url: `/lab/announcements/${id}`,
    method: 'get',
  })
}

export function createAnnouncementApi(data) {
  const userId = getCurrentUserId()
  return request({
    url: '/lab/announcements',
    method: 'post',
    params: { userId },
    data: {
      // 后端 dto: title, content, status?, publisherId?, labId?
      ...data,
      publisherId: userId,
    },
  })
}

export function updateAnnouncementApi(id, data) {
  const userId = getCurrentUserId()
  return request({
    url: `/lab/announcements/${id}`,
    method: 'put',
    params: { userId },
    data: {
      ...data,
      publisherId: userId,
    },
  })
}

export function deleteAnnouncementApi(id) {
  const userId = getCurrentUserId()
  return request({
    url: `/lab/announcements/${id}`,
    method: 'delete',
    params: { userId },
    data: { userId },
  })
}

