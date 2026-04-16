import { getLabDetailApi, updateLabApi } from '../api/lab'

/**
 * 更新实验室状态（0-停用, 1-正常, 2-维护中）。
 * 为兼容后端需要完整字段的场景，这里会先拉取详情再回写，仅覆盖 status。
 */
export async function updateLabStatusSafe(labId, status) {
  if (labId == null || labId === '') return
  const id = Number(labId)
  if (!Number.isFinite(id)) return

  const detail = await getLabDetailApi(id)
  const payload = {
    name: detail?.name ?? detail?.labName,
    code: detail?.code ?? detail?.labCode,
    categoryId: detail?.categoryId ?? detail?.category?.id ?? detail?.category?.categoryId,
    status,
    openTime: detail?.openTime,
    closeTime: detail?.closeTime,
    location: detail?.location,
    equipment: detail?.equipment,
    description: detail?.description,
    imageUrl: detail?.imageUrl ?? detail?.image,
    // 管理员字段命名兼容
    managerUserId:
      detail?.managerUserId ??
      detail?.managerId ??
      detail?.manager?.userId ??
      detail?.manager?.id ??
      detail?.manager_id?.userId ??
      detail?.manager_id?.id,
    managerId:
      detail?.managerUserId ??
      detail?.managerId ??
      detail?.manager?.userId ??
      detail?.manager?.id ??
      detail?.manager_id?.userId ??
      detail?.manager_id?.id,
  }

  await updateLabApi(id, payload)
}

