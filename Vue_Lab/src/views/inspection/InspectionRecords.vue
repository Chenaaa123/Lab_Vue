<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listMaintenancesApi, updateMaintenanceApi } from '../../api/maintenance'
import { listLabsApi, listLabsByManagerApi } from '../../api/lab'
import { listLabCategoriesApi } from '../../api/labCategory'
import { listUsersApi } from '../../api/user'
import { extractPagedTotal } from '../../utils/pagination'
import { extractLabId, findLabById } from '../../utils/labLookup'
import { toListApiRole } from '../../utils/apiRole'
import { subscribeLabsStaleForCategory } from '../../utils/labCategoryRefresh'
import { updateLabStatusSafe } from '../../utils/labStatusUpdate'

const loading = ref(false)
const maintenances = ref([])
const labs = ref([])
const total = ref(0)

const query = reactive({
  labId: undefined,
  status: undefined,
  /** 报修人用户 id（管理员/实验室管理员筛选；师生仅看本人，不使用此项） */
  reporterUserId: undefined,
  page: 1,
  size: 10,
})

/** 全量用户，供报修人下拉 */
const userOptions = ref([])

const userInfo = computed(() => localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : {})
const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')
const isLabManager = computed(() => role.value === '实验室管理员')
const isStudentOrTeacher = computed(() => role.value === '学生' || role.value === '老师')
const currentUserId = computed(() => userInfo.value?.userId || userInfo.value?.id)

/** 分类上的实验室管理员 id（与 LabCategoryManage 一致） */
const resolveCategoryManagerId = (c) => {
  if (!c) return null
  const v =
    c.managerUserId ??
    c.managerId ??
    (typeof c.manager_id === 'number' || typeof c.manager_id === 'string'
      ? c.manager_id
      : null) ??
    c.manager_id?.userId ??
    c.manager_id?.id ??
    c.manager?.userId ??
    c.manager?.id
  return v != null && v !== '' ? v : null
}

/** 实验室管理员：任管分类下全部实验室 + 任管实验室（去重），用于下拉与 labIds 范围 */
const fetchLabsForLabManagerScope = async (uid) => {
  const byId = new Map()
  const addRows = (data) => {
    const rows = data?.records || data?.list || data || []
    for (const row of rows) {
      const id = row.id ?? row.labId
      if (id != null && !byId.has(Number(id))) byId.set(Number(id), row)
    }
  }
  try {
    addRows(await listLabsByManagerApi(uid, { page: 1, size: 500 }))
  } catch {
    /* ignore */
  }
  try {
    const catData = await listLabCategoriesApi()
    const cats = Array.isArray(catData) ? catData : catData?.records || catData?.list || []
    for (const c of cats) {
      if (String(resolveCategoryManagerId(c)) !== String(uid)) continue
      const cid = c.id
      if (cid == null) continue
      try {
        addRows(await listLabsApi({ categoryId: cid, page: 1, size: 500 }))
      } catch {
        /* ignore single category */
      }
    }
  } catch {
    /* ignore categories */
  }
  return [...byId.values()]
}

const scopeLabIds = computed(() =>
  labs.value
    .map((l) => l.id ?? l.labId)
    .filter((id) => id != null && id !== ''),
)

const loadLabs = async () => {
  try {
    if (isLabManager.value && currentUserId.value) {
      labs.value = await fetchLabsForLabManagerScope(currentUserId.value)
    } else {
      const params = { page: 1, size: 200 }
      const data = await listLabsApi(params)
      labs.value = data?.records || data?.list || data || []
    }
  } catch {
    labs.value = []
  }
}

/** 拉取全部用户，用于「报修人」筛选下拉 */
const loadAllUsers = async () => {
  try {
    const data = await listUsersApi({ page: 1, size: 5000 })
    const rows = data?.records || data?.list || data || []
    const seen = new Map()
    for (const u of rows) {
      const id = u.userId ?? u.id
      if (id == null || id === '') continue
      const key = String(id)
      if (seen.has(key)) continue
      const name = u.userName || u.name || u.realName || u.userAccount || `用户#${id}`
      const account = u.userAccount || u.username || ''
      seen.set(key, {
        id,
        label: account ? `${name}（${account}）` : name,
      })
    }
    userOptions.value = [...seen.values()].sort((a, b) =>
      String(a.label).localeCompare(String(b.label), 'zh-CN'),
    )
  } catch {
    userOptions.value = []
  }
}

const getLabName = (labId) => {
  const lab = findLabById(labs.value, labId)
  return lab?.name || lab?.labName || '未知实验室'
}

const getLabCode = (labId) => {
  const lab = findLabById(labs.value, labId)
  return lab?.code || lab?.labCode || '-'
}

const getStatusText = (status) => {
  const n = Number(status)
  if (n === 0) return '待处理'
  if (n === 1) return '已处理'
  if (n === 2) return '已超时'
  return status ?? '-'
}

const mapMaintenanceRows = (records) => {
  const now = new Date()
  return records.map((m) => {
    const lid = extractLabId(m)
    let status = m.status
    let statusText = getStatusText(m.status)

    if (status === 0 || status === '待处理') {
      const maintenanceTime = m.maintenanceTime || m.createdTime || m.createdAt
      if (maintenanceTime) {
        const maintenanceDate = new Date(maintenanceTime)
        if (maintenanceDate < now) {
          status = 2
          statusText = '已超时'
        }
      }
    }

    const reporterId =
      m.reporterId ??
      m.reporterUserId ??
      m.userId ??
      m.reporter?.userId ??
      m.reporter?.id ??
      m.repair?.reporterId ??
      m.repair?.userId ??
      m.repair?.reporter?.userId ??
      m.repair?.reporter?.id ??
      ''

    return {
      id: m.id ?? m.maintenanceId,
      repairId: m.repairId,
      labId: lid,
      labName: m.lab?.name || m.labName || getLabName(lid),
      repairTitle: m.repair?.title || m.repairTitle || m.title || '-',
      repairDescription: m.repair?.description || '-',
      handler: m.handler || m.handlerName || '-',
      handlerPhone: m.handlerPhone || '-',
      content: m.content || m.description || '-',
      result: m.result || '-',
      maintenanceUnit: m.maintenanceUnit || '-',
      maintenanceTime: m.maintenanceTime || m.createdTime || m.createdAt || '-',
      status,
      statusText,
      createdAt: m.createdTime || m.createdAt || '-',
      reporterId,
      reporterName:
        m.reporter?.userName ||
        m.repair?.reporter?.userName ||
        m.reporterName ||
        '-',
    }
  })
}

/** 后端未严格过滤时的前端兜底 */
const applyScopeFilter = (rows) => {
  const uid = String(currentUserId.value ?? '')
  if (isAdmin.value) return rows
  if (isStudentOrTeacher.value) {
    return rows.filter((r) => String(r.reporterId ?? '') === uid)
  }
  if (isLabManager.value) {
    const allowed = new Set(scopeLabIds.value.map((id) => String(id)))
    if (allowed.size === 0) return []
    return rows.filter((r) => allowed.has(String(r.labId ?? '')))
  }
  return rows.filter((r) => String(r.reporterId ?? '') === uid)
}

const loadMaintenances = async () => {
  loading.value = true
  try {
    if (currentUserId.value == null || currentUserId.value === '') {
      maintenances.value = []
      total.value = 0
      ElMessage.warning('未获取到用户信息，请重新登录')
      return
    }

    const params = {
      page: query.page,
      size: query.size,
      userId: currentUserId.value,
      role: toListApiRole(role.value),
    }

    if (query.labId != null && query.labId !== '') {
      params.labId = query.labId
      params.lab_id = query.labId
    }

    if (query.status != null && query.status !== '') {
      params.status = query.status
    }

    if (isLabManager.value) {
      const ids = scopeLabIds.value.map((id) => Number(id)).filter((n) => Number.isFinite(n))
      if (ids.length === 0) {
        maintenances.value = []
        total.value = 0
        return
      }
      if (query.labId != null && query.labId !== '') {
        const pick = String(query.labId)
        if (!ids.some((id) => String(id) === pick)) {
          maintenances.value = []
          total.value = 0
          return
        }
      }
      params.labIds = ids
    }

    // 按报修人：与 GET /lab/maintenances 约定一致，只传 reporterUserId（优先参数；不传 reporterId 避免重复）
    if (isStudentOrTeacher.value) {
      params.reporterUserId = currentUserId.value
    } else if (query.reporterUserId != null && query.reporterUserId !== '') {
      params.reporterUserId = query.reporterUserId
    }

    const data = await listMaintenancesApi(params)
    let records = data?.records || data?.list || data || []
    const mapped = mapMaintenanceRows(records)
    const filtered = applyScopeFilter(mapped)
    maintenances.value = filtered

    const rawTotal = extractPagedTotal(data, records.length)
    const leaked = mapped.length - filtered.length
    total.value = leaked > 0 ? Math.max(0, rawTotal - leaked) : rawTotal
  } catch (e) {
    ElMessage.error(e.message || '加载检修记录失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.page = 1
  loadMaintenances()
}

const handlePageChange = () => {
  loadMaintenances()
}

const handleSizeChange = () => {
  query.page = 1
  loadMaintenances()
}

const canOperateMaintenance = computed(() => isAdmin.value || isLabManager.value)

// 待处理和已超时状态都可以点击检修完成（仅管理员/实验室管理员）
const canComplete = (row) => {
  const s = row?.status
  return s === 0 || s === '待处理' || s === 2 || s === '已超时'
}

const openCompleteDialog = async (row) => {
  try {
    await updateMaintenanceApi(row.id, {
      status: 1,
    })
    // 检修完成后：实验室状态置回正常（1）
    try {
      await updateLabStatusSafe(row.labId, 1)
    } catch {
      // 状态更新失败不阻断检修完成主流程
    }
    ElMessage.success('检修已完成')
    await loadMaintenances()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '操作失败'
    ElMessage.error(msg)
  }
}

const unsubLabsStale = subscribeLabsStaleForCategory(() => {
  loadLabs()
})

onMounted(async () => {
  await loadLabs()
  if (!isStudentOrTeacher.value) {
    await loadAllUsers()
  }
  await loadMaintenances()
})

onUnmounted(() => {
  unsubLabsStale()
})
</script>

<template>
  <div class="maintenance-page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item v-if="!isStudentOrTeacher">
          <el-select
            v-model="query.reporterUserId"
            placeholder="请选择报修人"
            clearable
            filterable
            style="width: 240px"
          >
            <el-option
              v-for="o in userOptions"
              :key="o.id"
              :label="o.label"
              :value="o.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.labId" placeholder="实验室编号" clearable style="width: 180px">
            <el-option v-for="l in labs" :key="l.id ?? l.labId" :label="l.code || l.labCode" :value="l.id ?? l.labId" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="maintenances" border v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="reporterName" label="报修人" width="100" />
        <el-table-column prop="handler" label="检修人" width="100" />
        <el-table-column prop="handlerPhone" label="联系电话" width="120" />
        <el-table-column label="实验室编号" min-width="120">
          <template #default="{ row }">
            {{ getLabCode(row.labId) }}
          </template>
        </el-table-column>
        <el-table-column prop="maintenanceTime" label="检修时间" width="170" />
        <el-table-column prop="maintenanceUnit" label="检修单位" width="120" />
        <el-table-column prop="content" label="检修说明" min-width="160" show-overflow-tooltip />
        <el-table-column label="检修状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'warning' : row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.statusText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canOperateMaintenance" label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              v-if="canComplete(row)"
              size="small"
              type="primary"
              @click="openCompleteDialog(row)"
            >
              检修完成
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.maintenance-page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { margin-bottom: 0; }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
