<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listReservationsApi, cancelReservationApi, auditReservationApi, finishReservationApi, repairReservationApi } from '../../api/reservation'
import { listLabsApi, listLabsByManagerApi } from '../../api/lab'
import { extractLabId, findLabById, resolveLabManagerUserId } from '../../utils/labLookup'
import { extractPagedTotal } from '../../utils/pagination'
import { normalizeReservationRole, toListApiRole } from '../../utils/apiRole'
import { isReservationEligibleForRepair } from '../../utils/reservationRepairEligibility'
import { subscribeLabsStaleForCategory } from '../../utils/labCategoryRefresh'

const loading = ref(false)
const reservations = ref([])
const labs = ref([])
const total = ref(0)

/** 使用状态筛选项（与表格「使用状态」列 useStatusText 一致） */
const USE_STATUS_FILTER = {
  pending_audit: '待审核',
  pending_use: '待使用',
  in_use: '使用中',
  finished: '使用完成',
  cancelled: '已取消',
}

const query = reactive({
  status: undefined,
  labId: undefined,
  useStatusKey: undefined,
  page: 1,
  size: 10,
})

// 审核对话框
const auditDialogVisible = ref(false)
const auditSubmitting = ref(false)
const auditRow = ref(null)
const auditForm = reactive({
  rejectReason: '',
})

// 报修对话框
const repairDialogVisible = ref(false)
const repairSubmitting = ref(false)
const repairRow = ref(null)
const repairForm = reactive({
  title: '',
  description: '',
})

// 获取当前用户信息
const userInfo = computed(() => {
  const info = localStorage.getItem('userInfo')
  return info ? JSON.parse(info) : {}
})

const currentUserId = computed(() => userInfo.value?.userId ?? userInfo.value?.id)

const userRole = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => userRole.value === '系统管理员')
const isLabManager = computed(() => userRole.value === '实验室管理员')
const canAudit = computed(() => isAdmin.value || isLabManager.value)
const router = useRouter()

// 加载实验室列表（下拉：管理员全量；实验室管理员仅管辖；师生用于下拉筛选）
const loadLabs = async () => {
  try {
    const params = { page: 1, size: 500 }
    let data
    if (isLabManager.value && currentUserId.value) {
      data = await listLabsByManagerApi(currentUserId.value, params)
    } else {
      data = await listLabsApi(params)
    }
    labs.value = data?.records || data?.list || data || []
  } catch {
    labs.value = []
  }
}

// 获取实验室名称
const getLabName = (labId) => {
  const lab = findLabById(labs.value, labId)
  return lab?.name || lab?.labName || '未知实验室'
}

// 获取实验室编号
const getLabCode = (labId) => {
  const lab = findLabById(labs.value, labId)
  return lab?.code || lab?.labCode || '-'
}

const filteredLabs = computed(() => {
  if (isAdmin.value) return labs.value
  if (isLabManager.value) {
    const uid = String(currentUserId.value ?? '')
    return labs.value.filter(
      (l) => String(resolveLabManagerUserId(l) ?? '') === uid,
    )
  }
  return labs.value
})

/** 从行数据解析预约人用户 ID（兼容后端字段） */
const rowReserverUserId = (row) =>
  row?.userId ?? row?.user_id ?? row?.reserverId ?? row?.reserver_user_id ?? ''

/**
 * 后端若未按角色过滤，前端按角色兜底（仅当前页；并修正 total 的粗略估算）
 */
const applyRoleScopeFilter = (rows) => {
  if (isAdmin.value) return rows
  if (isLabManager.value) {
    const uid = String(currentUserId.value ?? '')
    const allowed = new Set(
      labs.value
        .filter((l) => String(resolveLabManagerUserId(l) ?? '') === uid)
        .map((l) => String(l.id ?? l.labId)),
    )
    return rows.filter((r) => allowed.has(String(r.labId)))
  }
  const uid = String(currentUserId.value ?? '')
  if (!uid) return []
  return rows.filter((r) => String(rowReserverUserId(r)) === uid)
}

/** 按所选实验室筛选（后端常忽略 labId 或与 labIds 冲突时兜底） */
const applyLabFilter = (rows) => {
  if (query.labId == null || query.labId === '') return rows
  const want = String(query.labId)
  return rows.filter((r) => String(r.labId ?? r.lab_id ?? '') === want)
}

/** 按使用状态筛选（与 useStatusText 计算结果比对；后端若忽略 useStatus 参数时仍生效） */
const applyUseStatusFilter = (rows) => {
  const key = query.useStatusKey
  if (key == null || key === '') return rows
  const want = USE_STATUS_FILTER[key]
  if (!want) return rows
  return rows.filter((r) => useStatusText(r) === want)
}

// 预约状态码映射：0-待审核, 1-已通过, 2-已拒绝, 3-已结束, 4-已取消
const getStatusText = (status) => {
  const n = Number(status)
  if (n === 0) return '待审核'
  if (n === 1) return '已通过'
  if (n === 2) return '已拒绝'
  if (n === 3) return '已结束'
  if (n === 4) return '已取消'
  return '-'
}

const parseDateTime = (v) => {
  if (!v) return null
  const s = String(v).replace(/\.\d+$/, '').trim()
  const d = new Date(s)
  // invalid date -> null
  // eslint-disable-next-line no-restricted-globals
  return isNaN(d.getTime()) ? null : d
}

/**
 * 预约状态（审核状态）展示：
 * - 待审核：status=0
 * - 审核通过：status=1 或 status=3（使用完成/已结束，审核依旧通过）
 * - 审核不通过：status=2
 * - 已取消：status=4
 */
const auditStatusText = (row) => {
  const s = Number(row?.status)
  if (s === 0) return '待审核'
  if (s === 1) return '审核通过'
  if (s === 2) return '审核不通过'
  if (s === 3) return '审核通过'
  if (s === 4) return '已取消'
  return row?.reservationStatus || getStatusText(row?.status)
}

/**
 * 使用状态展示（补充逻辑）：
 * - status=0 → 待审核
 * - status=1 且 未到开始时间 → 待使用
 * - status=1 且 已到开始时间 且 未使用完成 → 使用中
 * - status=1 且 已使用完成 / status=3 → 使用完成
 * - status=2/4 → 已取消
 */
const useStatusText = (row) => {
  const s = Number(row?.status)
  if (s === 0) return '待审核'
  if (s === 2 || s === 4) return '已取消'
  if (s === 3) return '使用完成'
  if (s === 1) {
    const useCode = row?.useStatusCode
    if (useCode === 2 || useCode === '2' || row?.useStatus === '使用完成') return '使用完成'
    const start = parseDateTime(row?.startTime)
    const end = parseDateTime(row?.endTime)
    const now = new Date()
    if (start && now < start) return '待使用'   // 审核通过但未到使用时间段
    if (start && end && now >= start && now <= end) return '使用中'
    if (start && now > start) return '使用中'  // 已过开始时间，未点使用完成前仍显示使用中（或后端可能已置为使用完成）
    if (end && now > end) return '使用完成'   // 已过结束时间视为使用完成
    return row?.useStatus === '使用中' ? '使用中' : '待使用'
  }
  if (row?.useStatus === '待审核' || row?.useStatus === '使用中' || row?.useStatus === '使用完成' || row?.useStatus === '已取消') return row.useStatus
  return '-'
}

// 格式化时间段显示（完整 年月日 时分），后端可能返回 "2026-03-07 23:47:06.000000"
const formatTimeRange = (start, end) => {
  if (!start || !end) return '-'
  const s = String(start).replace(/\.\d+$/, '').slice(0, 16)
  const e = String(end).replace(/\.\d+$/, '').slice(0, 16)
  return `${s} 至 ${e}`
}

// 加载预约记录
const loadReservations = async () => {
  loading.value = true
  try {
    const uid = userInfo.value?.userId ?? userInfo.value?.id
    if (uid == null || uid === '') {
      reservations.value = []
      total.value = 0
      ElMessage.warning('未获取到用户信息，请重新登录')
      return
    }

    const params = {
      page: query.page,
      size: query.size,
      userId: uid,
      role: toListApiRole(userRole.value),
    }

    // 状态筛选
    if (query.status !== undefined && query.status !== null && query.status !== '') {
      params.status = query.status
    }

    // 使用状态筛选
    if (query.useStatusKey != null && query.useStatusKey !== '') {
      const label = USE_STATUS_FILTER[query.useStatusKey]
      if (label) {
        params.useStatus = label
        params.usageStatus = label
      }
    }

    // 实验室筛选（根据后端API设计，只需传递labId参数）
    if (query.labId != null && query.labId !== '') {
      params.labId = query.labId
      params.lab_id = query.labId  // 兼容蛇形命名
    }

    const data = await listReservationsApi(params)

    let records = []
    if (Array.isArray(data)) {
      records = data
    } else if (data && typeof data === 'object') {
      records = data.records || data.list || data.items || data.data || []
    }

    const mapped = records.map((item) => {
      const lid = extractLabId(item)
      return {
      id: item.id ?? item.reservationId,
      labId: lid,
      userId:
        item.userId ??
        item.user_id ??
        item.reserverId ??
        item.user?.userId ??
        item.user?.id ??
        '',
      labName: item.labName || getLabName(lid),
      labCode: item.labCode ?? item.lab_code ?? getLabCode(lid),
      labManagerUserId:
        item.labManagerUserId ??
        item.lab_manager_user_id ??
        item.managerUserId ??
        item.manager_id ??
        item.lab?.managerUserId ??
        item.lab?.managerId ??
        item.lab?.manager_id ??
        null,
      labManager: item.labManagerName || '-',
      userName: item.reserverName || item.userName || '-',
      createTime: item.createdTime || '-',
      startTime: item.startTime || '-',
      endTime: item.endTime || '-',
      status: item.status,
      reservationStatus: item.statusText || getStatusText(item.status),
      useStatus: item.useStatus || item.useStatusText || '-',
      useStatusCode: item.useStatusCode ?? item.use_status_code,
      /** 数值型使用状态（如后端直接返回 2 表示已结束），供报修前置判断 */
      useStatusNumeric: (() => {
        const u = item.useStatus ?? item.use_status
        if (u == null || u === '') return NaN
        const n = Number(u)
        return Number.isFinite(n) ? n : NaN
      })(),
    }
    })

    const roleFiltered = applyRoleScopeFilter(mapped)
    const labFiltered = applyLabFilter(roleFiltered)
    const filtered = applyUseStatusFilter(labFiltered)
    reservations.value = filtered

    const rawTotal = extractPagedTotal(data, records.length)
    const leaked = mapped.length - filtered.length
    if (leaked > 0) {
      total.value = Math.max(0, rawTotal - leaked)
    } else {
      total.value = rawTotal
    }
  } catch (e) {
    ElMessage.error(e.message || '加载预约记录失败')
  } finally {
    loading.value = false
  }
}

// 预约状态标签类型
const reservationStatusType = (status) => {
  if (status === '待审核' || status === 'PENDING') return 'warning'
  if (status === '已通过' || status === 'APPROVED') return 'success'
  if (status === '已结束') return 'success'
  if (status === '已拒绝' || status === 'REJECTED') return 'danger'
  if (status === '已取消' || status === 'CANCELLED') return 'info'
  return ''
}

// 使用状态标签类型：待审核、待使用、使用中、使用完成、已取消
const useStatusTagType = (text) => {
  if (text === '待审核') return 'warning'
  if (text === '待使用') return 'info'
  if (text === '使用中') return 'primary'
  if (text === '使用完成') return 'success'
  if (text === '已取消') return 'info'
  return ''
}

// 是否可以取消预约：待审核 或 审核通过且待使用（未到使用时间段），仅本人
const canCancel = (row) => {
  const useStatus = useStatusText(row)
  const auditStatus = auditStatusText(row)
  const currentUserId = String(userInfo.value?.userId ?? userInfo.value?.id ?? '')
  const rowUserId = String(row?.userId ?? row?.user_id ?? '')
  if (!currentUserId || currentUserId !== rowUserId) return false
  if (auditStatus === '待审核') return true
  if (auditStatus === '审核通过' && useStatus === '待使用') return true
  return false
}

// 是否可使用完成：使用状态为"使用中"，仅本人
const canFinish = (row) => {
  const useStatus = useStatusText(row)
  const currentUserId = String(userInfo.value?.userId ?? userInfo.value?.id ?? '')
  const rowUserId = String(row?.userId ?? row?.user_id ?? '')
  if (useStatus !== '使用中') return false
  return currentUserId && rowUserId && currentUserId === rowUserId
}

/** 当前登录用户是否为该预约所属实验室的管辖管理员（优先用预约/实验室接口带回的 manager 用户 id，其次用本地实验室列表） */
const isReservationLabManagedByCurrentUser = (row) => {
  const uid = String(userInfo.value?.userId ?? userInfo.value?.id ?? '')
  if (!uid) return false
  const fromApi =
    row?.labManagerUserId ??
    row?.lab_manager_user_id ??
    row?.managerUserId ??
    row?.manager_id
  if (fromApi != null && fromApi !== '' && String(fromApi) === uid) return true
  const lab = findLabById(labs.value, row.labId ?? row.lab_id)
  return !!lab && String(resolveLabManagerUserId(lab) ?? '') === uid
}

/**
 * 是否可报修：与后端一致 — status=1 且（useStatus=2 或 endTime 已过），再按角色校验
 * - 学生/教师：须为预约人本人
 * - 系统管理员：任意满足前置条件的预约
 * - 实验室管理员：仅所管辖实验室的预约
 */
const canRepair = (row) => {
  if (!isReservationEligibleForRepair(row)) return false

  const uid = String(userInfo.value?.userId ?? userInfo.value?.id ?? '')
  const rowUserId = String(
    row?.userId ?? row?.user_id ?? row?.reserverId ?? row?.reserver_user_id ?? '',
  )
  if (!uid) return false

  if (rowUserId && uid === rowUserId) return true
  if (isAdmin.value) return true
  if (isLabManager.value && isReservationLabManagedByCurrentUser(row)) return true
  return false
}

// 是否可以审核：仅待审核(0)可审核
const canAuditStatus = (row) => {
  const s = row?.status ?? row?.reservationStatus
  return s === 0 || s === '待审核' || s === 'PENDING'
}

// 管理员/实验室管理员是否可结束使用：审核通过 + 使用中
const canAdminFinish = (row) => {
  const useStatus = useStatusText(row)
  const auditStatus = auditStatusText(row)
  const approved = auditStatus === '审核通过' || auditStatus === '已通过'
  return approved && useStatus === '使用中'
}

// 通过：直接提交
const handleAuditPass = async (row) => {
  auditSubmitting.value = true
  try {
    await auditReservationApi(row.id, {
      status: 1,
      auditUserId: userInfo.value?.userId || userInfo.value?.id,
    })
    ElMessage.success('已通过预约申请')
    await loadReservations()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '操作失败'
    ElMessage.error(msg)
  } finally {
    auditSubmitting.value = false
  }
}

// 不通过：打开对话框填写拒绝原因
const openRejectDialog = (row) => {
  auditRow.value = row
  auditForm.rejectReason = ''
  auditDialogVisible.value = true
}

// 提交拒绝
const submitReject = async () => {
  if (auditSubmitting.value) return
  if (!auditForm.rejectReason?.trim()) {
    ElMessage.warning('请填写拒绝原因')
    return
  }
  auditSubmitting.value = true
  try {
    await auditReservationApi(auditRow.value.id, {
      status: 2,
      auditUserId: userInfo.value?.userId || userInfo.value?.id,
      rejectReason: auditForm.rejectReason.trim(),
    })
    ElMessage.success('已拒绝预约申请')
    auditDialogVisible.value = false
    await loadReservations()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '操作失败'
    ElMessage.error(msg)
  } finally {
    auditSubmitting.value = false
  }
}

// 取消预约
const handleCancel = async (row) => {
  try {
    await ElMessageBox.confirm('确定要取消该预约吗？', '提示', { type: 'warning' })
    await cancelReservationApi(row.id)
    ElMessage.success('取消预约成功')
    loadReservations()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e.response?.data?.message ?? e.message ?? '取消预约失败'
      ElMessage.error(msg)
    }
  }
}

// 使用完成
const handleFinish = async (row) => {
  try {
    await ElMessageBox.confirm('确定提前结束使用并释放实验室吗？', '使用完成', { type: 'warning' })
    await finishReservationApi(row.id)
    ElMessage.success('使用已完成，实验室已释放')
    await loadReservations()
  } catch (e) {
    if (e !== 'cancel') {
      const msg = e.response?.data?.message ?? e.message ?? '操作失败'
      ElMessage.error(msg)
    }
  }
}

// 报修：跳转到报修创建页，携带预约信息
const handleRepair = (row) => {
  router.push({ path: '/repairs/my', query: { reservationId: row.id, labId: row.labId, labName: row.labName } })
}

// 报修：打开报修对话框
const openRepairDialog = (row) => {
  repairRow.value = row
  repairForm.title = ''
  repairForm.description = ''
  repairDialogVisible.value = true
}

// 提交报修（请求体须含 userId、role，与后端 §6.7 一致）
const submitRepair = async () => {
  if (!repairForm.title.trim()) {
    ElMessage.warning('请输入报修标题')
    return
  }

  const uid = userInfo.value?.userId ?? userInfo.value?.id
  if (uid == null || uid === '') {
    ElMessage.warning('未获取到用户信息，请重新登录')
    return
  }

  repairSubmitting.value = true
  try {
    const data = {
      userId: uid,
      role: normalizeReservationRole(userRole.value),
      title: repairForm.title.trim(),
      description: repairForm.description?.trim() || '',
    }
    await repairReservationApi(repairRow.value?.id, data)
    ElMessage.success('报修申请已提交')
    repairDialogVisible.value = false
    await loadReservations()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '报修提交失败'
    ElMessage.error(msg)
  } finally {
    repairSubmitting.value = false
  }
}

// 搜索
const handleSearch = () => {
  query.page = 1
  loadReservations()
}

// 重置查询条件
const handleReset = () => {
  query.status = undefined
  query.labId = undefined
  query.useStatusKey = undefined
  query.page = 1
  loadReservations()
}

const handlePageChange = () => {
  loadReservations()
}

const handleSizeChange = (size) => {
  query.size = size
  query.page = 1
  loadReservations()
}

// 获取序号
const getRowNo = (index) => (query.page - 1) * query.size + index + 1

const unsubLabsStale = subscribeLabsStaleForCategory(() => {
  loadLabs()
})

onMounted(async () => {
  await loadLabs()
  await loadReservations()
})

onUnmounted(() => {
  unsubLabsStale()
})
</script>

<template>
  <div class="reservation-page">
    <!-- 查询区域 -->
    <el-card class="filter-card" shadow="never">
      <!-- 权限提示 -->
      <div v-if="isLabManager && filteredLabs.length === 0" class="permission-notice">
        <el-alert
          title="权限提示"
          description="您当前没有管理任何实验室，请联系系统管理员分配实验室管理权限。"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <el-form :inline="true" label-width="0" class="filter-form">
        <el-form-item>
          <el-select v-model="query.labId" placeholder="请选择实验室编号" clearable filterable style="width: 220px">
            <el-option
              v-for="lab in filteredLabs"
              :key="lab.id || lab.labId"
              :label="lab.code || lab.labCode"
              :value="lab.id || lab.labId"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.status" placeholder="预约状态" clearable style="width: 140px">
            <el-option label="待审核" :value="0" />
            <el-option label="已通过" :value="1" />
            <el-option label="已拒绝" :value="2" />
            <el-option label="已结束" :value="3" />
            <el-option label="已取消" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.useStatusKey" placeholder="使用状态" clearable style="width: 140px">
            <el-option label="待审核" value="pending_audit" />
            <el-option label="待使用" value="pending_use" />
            <el-option label="使用中" value="in_use" />
            <el-option label="使用完成" value="finished" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 预约记录表格（操作列不使用 fixed，避免与表体样式割裂） -->
    <el-card shadow="never" class="table-card">
      <el-table
        :data="reservations"
        border
        stripe
        class="reservation-table"
        v-loading="loading"
      >
        <el-table-column type="index" label="序号" width="60" align="center">
          <template #default="{ $index }">
            {{ getRowNo($index) }}
          </template>
        </el-table-column>
        <el-table-column label="实验室编号" min-width="160">
          <template #default="{ row }">
            {{ row.labCode }}
          </template>
        </el-table-column>
        <el-table-column prop="labManager" label="实验室管理员" width="110" />
        <el-table-column prop="userName" label="预约人" width="100" />
        <el-table-column prop="createTime" label="操作时间" width="160" />
        <el-table-column label="使用时间段" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatTimeRange(row.startTime, row.endTime) }}
          </template>
        </el-table-column>
        <el-table-column label="预约状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="reservationStatusType(row.reservationStatus)" size="small">
              {{ auditStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="useStatusTagType(useStatusText(row))" size="small">
              {{ useStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <!-- 管理员/实验室管理员 -->
            <template v-if="canAudit && canAuditStatus(row)">
              <el-button size="small" type="success" :loading="auditSubmitting" @click="handleAuditPass(row)">
                通过
              </el-button>
              <el-button size="small" type="danger" :loading="auditSubmitting" @click="openRejectDialog(row)">
                不通过
              </el-button>
            </template>
            <!-- 审核通过且使用中：结束使用 -->
            <template v-else-if="canAdminFinish(row)">
              <el-button size="small" type="success" @click="handleFinish(row)">
                结束使用
              </el-button>
            </template>
            <!-- 师生本人操作；管理员/实验室管理员在满足条件时可代报修 -->
            <template v-else>
              <el-button v-if="canCancel(row)" size="small" @click="handleCancel(row)">
                取消预约
              </el-button>
              <el-button
                v-else-if="canFinish(row)"
                size="small"
                type="success"
                @click="handleFinish(row)"
              >
                使用完成
              </el-button>
              <el-button
                v-else-if="canRepair(row)"
                size="small"
                type="warning"
                @click="openRepairDialog(row)"
              >
                故障报修
              </el-button>
              <span v-else>-</span>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 不通过：填写拒绝原因 -->
    <el-dialog v-model="auditDialogVisible" title="拒绝预约" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="实验室">
          <span>{{ auditRow?.labName }} - {{ auditRow?.labCode }}</span>
        </el-form-item>
        <el-form-item label="预约人">
          <span>{{ auditRow?.userName }}</span>
        </el-form-item>
        <el-form-item label="拒绝原因" required>
          <el-input
            v-model="auditForm.rejectReason"
            type="textarea"
            :rows="3"
            placeholder="请输入拒绝原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="auditDialogVisible = false" :disabled="auditSubmitting">取 消</el-button>
        <el-button type="danger" :loading="auditSubmitting" @click="submitReject">确 定</el-button>
      </template>
    </el-dialog>

    <!-- 故障报修对话框 -->
    <el-dialog v-model="repairDialogVisible" title="故障报修" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="实验室">
          <span>{{ repairRow?.labName }}</span>
        </el-form-item>
        <el-form-item
          v-if="repairRow && String(rowReserverUserId(repairRow)) !== String(currentUserId ?? '')"
          label="预约人"
        >
          <span>{{ repairRow?.userName || '-' }}</span>
        </el-form-item>
        <el-form-item label="报修标题" required>
          <el-input
            v-model="repairForm.title"
            placeholder="请输入报修标题，如：设备故障"
          />
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input
            v-model="repairForm.description"
            type="textarea"
            :rows="3"
            placeholder="请详细描述故障情况"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="repairDialogVisible = false" :disabled="repairSubmitting">取 消</el-button>
        <el-button type="primary" :loading="repairSubmitting" @click="submitRepair">提 交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.reservation-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.permission-notice {
  margin-bottom: 16px;
}

.filter-card {
  margin-bottom: 4px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.table-card :deep(.el-table) {
  --el-table-border-color: var(--el-border-color-lighter);
}

.table-card :deep(.el-table__cell) {
  vertical-align: middle;
}

.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
