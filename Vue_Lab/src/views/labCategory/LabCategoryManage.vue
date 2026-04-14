<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  assignLabCategoryManagerApi,
  createLabCategoryApi,
  deleteLabCategoryApi,
  getManagerNameApi,
  listLabCategoriesApi,
  updateLabCategoryApi,
} from '../../api/labCategory'
import { listUsersApi } from '../../api/user'
import { notifyLabsStaleForCategory } from '../../utils/labCategoryRefresh'

const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')

const loading = ref(false)
const query = reactive({
  keyword: '',
  page: 1,
  size: 10,
})

const allRows = ref([])
const tableData = ref([])
const total = ref(0)
const selectedRows = ref([]) // 存储选中的行

const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogMode = ref('create') // create | edit
const currentId = ref(null)

const form = reactive({
  name: '',
  description: '',
  managerUserId: null,
})

const usersLoading = ref(false)
const managerOptions = ref([])
const managerLoadError = ref('')
const managerNameCache = ref(new Map()) // 缓存管理员姓名

const currentUser = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
})

const normalizeList = (data) => {
  if (Array.isArray(data)) return data
  return data?.records || data?.list || data?.items || []
}

const unwrapCreatedCategoryId = (res) => {
  if (!res || typeof res !== 'object') return null
  return res.id ?? res.categoryId ?? res.data?.id ?? null
}

const loadManagers = async () => {
  usersLoading.value = true
  managerLoadError.value = ''
  try {
    const data = await listUsersApi({ page: 1, size: 200 })
    const list = normalizeList(data)
    const all = (list || [])
      .map((u) => ({
        userId: u.userId ?? u.id,
        userName: u.userName ?? u.name ?? u.userAccount ?? u.realName,
        role: u.role ?? u.roleName ?? u.role_code,
      }))
      .filter((u) => u.userId && u.userName)

    const filtered = all.filter((u) => {
        const r = String(u.role ?? '').trim()
        return (
          r === '实验室管理员' ||
          r.includes('实验室管理员')
        )
      })

    // 如果后端 role 字段不一致导致过滤为空，先兜底展示全部用户，避免下拉无数据
    if (filtered.length === 0 && all.length > 0) {
      ElMessage.warning('未筛选到“实验室管理员”角色用户，已临时展示全部用户（请确认后端 role 字段值）')
      managerOptions.value = all
    } else {
      managerOptions.value = filtered
    }
  } catch (e) {
    managerOptions.value = []
    const msg = e?.message || '获取用户列表失败（/lab/users），请确认接口已实现且当前账号有权限'
    managerLoadError.value = msg
    ElMessage.error(msg)
  } finally {
    usersLoading.value = false
  }
}

/** 分类行上「实验室管理员」用户主键（避免把嵌套对象误当成 id） */
const resolveCategoryManagerId = (row) => {
  if (!row) return null
  const v =
    row.managerUserId ??
    row.managerId ??
    (typeof row.manager_id === 'number' || typeof row.manager_id === 'string'
      ? row.manager_id
      : null) ??
    row.manager_id?.userId ??
    row.manager_id?.id ??
    row.manager?.userId ??
    row.manager?.id
  return v != null && v !== '' ? v : null
}

const getManagerName = async (row) => {
  const managerName =
    row?.managerUserName ??
    row?.labManagerName ??
    row?.managerName ??
    row?.manager?.userName ??
    row?.manager?.name ??
    row?.manager?.realName

  if (managerName) return managerName

  const managerId = resolveCategoryManagerId(row)

  if (managerId) {
    // 先从缓存中查找
    if (managerNameCache.value.has(managerId)) {
      return managerNameCache.value.get(managerId)
    }

    // 从本地用户列表中查找
    const hit = managerOptions.value.find((x) => Number(x.userId) === Number(managerId))
    if (hit?.userName) {
      managerNameCache.value.set(managerId, hit.userName)
      return hit.userName
    }

    // 如果本地没有，调用API获取
    try {
      const result = await getManagerNameApi(managerId)
      const name = result?.data?.managerName || result?.managerName || `用户#${managerId}`
      managerNameCache.value.set(managerId, name)
      return name
    } catch (e) {
      console.warn('获取管理员姓名失败:', e)
      return `用户#${managerId}`
    }
  }
  return '-'
}

const getManagerNameSync = (row) => {
  const explicitName =
    row?.managerUserName ??
    row?.labManagerName ??
    row?.managerName ??
    row?.managerUserName

  if (explicitName) return explicitName

  const managerId = resolveCategoryManagerId(row)

  if (managerId) {
    // 先从缓存中查找
    if (managerNameCache.value.has(managerId)) {
      return managerNameCache.value.get(managerId)
    }

    // 从本地用户列表中查找
    const hit = managerOptions.value.find((x) => Number(x.userId) === Number(managerId))
    if (hit?.userName) {
      return hit.userName
    }

    // 异步获取管理员姓名
    getManagerName(row).then(result => {
      managerNameCache.value.set(managerId, result)
    })

    return `加载中...`
  }

  const embedded =
    typeof row?.manager_id === 'object' && row.manager_id
      ? row.manager_id.userName || row.manager_id.name || row.manager_id.realName
      : null
  const fromManagerObj =
    row?.manager?.userName || row?.manager?.name || row?.manager?.realName
  return embedded || fromManagerObj || '-'
}

const filterRows = (rows) => {
  const k = query.keyword.trim()
  if (!k) return rows || []
  return (rows || []).filter((r) => {
    const name = String(r?.name ?? r?.categoryName ?? '').includes(k)
    const desc = String(r?.description ?? '').includes(k)
    return name || desc
  })
}

const applyFilterAndPage = () => {
  const kw = (query.keyword || '').trim().toLowerCase()
  const filtered = kw
    ? allRows.value.filter(r => {
        const name = (r?.name ?? '').toLowerCase()
        const code = (r?.code ?? '').toLowerCase()
        return name.includes(kw) || code.includes(kw)
      })
    : allRows.value
  total.value = filtered.length
  const start = (query.page - 1) * query.size
  const end = start + query.size
  tableData.value = filtered.slice(start, end)
}

const loadList = async () => {
  loading.value = true
  try {
    const data = await listLabCategoriesApi()
    const rows = normalizeList(data)
    // 统一按 id 升序，展示序号
    const sorted = (rows || []).slice().sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0))
    allRows.value = sorted
    // 每次重新加载列表时，重置到第一页
    query.page = 1
    applyFilterAndPage()
  } catch (e) {
    ElMessage.error(e.message || '加载分类列表失败')
  } finally {
    loading.value = false
  }
}

const resetQuery = () => {
  query.keyword = ''
  query.page = 1
  query.size = 10
  applyFilterAndPage()
}

const handleSearch = () => {
  query.page = 1
  applyFilterAndPage()
}

const openCreate = async () => {
  dialogMode.value = 'create'
  currentId.value = null
  form.name = ''
  form.description = ''
  form.managerUserId = null
  dialogVisible.value = true
  await loadManagers()
}

const openEdit = async (row) => {
  dialogMode.value = 'edit'
  currentId.value = row.id
  form.name = row.name ?? row.categoryName ?? ''
  form.description = row.description ?? ''
  // 不预填实验室管理员：仅当用户主动选择时才调用分配接口，避免默认带上原管理员 id
  form.managerUserId = null
  dialogVisible.value = true
  await loadManagers()
}

const submit = async () => {
  if (!form.name.trim()) {
    ElMessage.warning('分类名称不能为空')
    return
  }

  const uid = currentUser.value?.userId || currentUser.value?.id
  if (!uid) {
    ElMessage.error('无法获取当前用户ID，请重新登录')
    return
  }

  dialogLoading.value = true
  try {
    if (dialogMode.value === 'create') {
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim?.() || form.description || '',
        adminUserId: Number(uid),
      }
      if (form.managerUserId != null && form.managerUserId !== '') {
        const mid = Number(form.managerUserId)
        payload.managerUserId = mid
        payload.managerId = mid
      }
      const created = await createLabCategoryApi(payload)
      ElMessage.success('新增成功')
      if (form.managerUserId != null && form.managerUserId !== '') {
        notifyLabsStaleForCategory(unwrapCreatedCategoryId(created))
      }
    } else {
      await updateLabCategoryApi(currentId.value, {
        name: form.name.trim(),
        description: form.description?.trim?.() || form.description || '',
      })
      if (form.managerUserId != null && form.managerUserId !== '') {
        const mid = Number(form.managerUserId)
        await assignLabCategoryManagerApi(currentId.value, {
          managerUserId: mid,
          managerId: mid,
          adminUserId: Number(uid),
        })
        // 后端同事务级联更新实验室 manager_id；通知各页按 categoryId 重拉实验室，避免界面仍显示旧管理员
        notifyLabsStaleForCategory(currentId.value)
      }
      ElMessage.success('保存成功')
    }

    dialogVisible.value = false
    await loadList()
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '提交失败'
    ElMessage.error(msg)
  } finally {
    dialogLoading.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该分类吗？删除后无法恢复。', '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteLabCategoryApi(row.id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e.message || '删除失败')
  }
}

// 处理表格选中变化
const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

// 批量删除
const batchDelete = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请选择要删除的分类')
    return
  }

  const ids = selectedRows.value.map(row => row.id)
  const names = selectedRows.value.map(row => row.name || row.categoryName).join('、')

  try {
    await ElMessageBox.confirm(
      `确认删除以下 ${selectedRows.value.length} 个分类吗？\n${names}\n删除后无法恢复。`,
      '批量删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }
    )

    // 逐个删除
    let successCount = 0
    let failCount = 0
    for (const row of selectedRows.value) {
      try {
        await deleteLabCategoryApi(row.id)
        successCount++
      } catch (e) {
        failCount++
        console.error(`删除分类 ${row.name || row.categoryName} 失败:`, e)
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功删除 ${successCount} 个分类`)
    }
    if (failCount > 0) {
      ElMessage.warning(`${failCount} 个分类删除失败`)
    }

    selectedRows.value = [] // 清空选中
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e.message || '批量删除失败')
  }
}

const getRowNo = (index) => index + 1

onMounted(async () => {
  // 提前拉一份用户，显示“实验室管理员”列时更可靠
  await loadManagers()
  await loadList()
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item>
          <el-input
            v-model="query.keyword"
            placeholder="请输入分类名称"
            clearable
            style="width: 280px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
          <el-button 
            type="danger" 
            :disabled="!isAdmin || selectedRows.length === 0" 
            @click="batchDelete"
          >
            批量删除
          </el-button>
        </el-form-item>

        <el-form-item v-if="isAdmin" style="margin-left: auto; margin-right: 40px;">
          <el-button type="primary" @click="openCreate">新增</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table 
        :data="tableData" 
        border 
        style="width: 100%" 
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" align="center" />
        <el-table-column label="序号" width="70" align="center">
          <template #default="{ $index }">
            {{ getRowNo($index) }}
          </template>
        </el-table-column>
        <el-table-column prop="name" label="分类名称" min-width="180">
          <template #default="{ row }">
            {{ row.name ?? row.categoryName ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="分类描述" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.description || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="实验室管理员" min-width="120">
          <template #default="{ row }">
            {{ getManagerNameSync(row) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" :disabled="!isAdmin" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" :disabled="!isAdmin" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          @size-change="() => { query.page = 1; applyFilterAndPage() }"
          @current-change="applyFilterAndPage"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="实验室分类表"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-form label-width="120px" class="edit-form">
        <el-form-item label="分类名称">
          <el-input v-model="form.name" placeholder="分类名称" />
        </el-form-item>
        <el-form-item label="分类描述">
          <el-input v-model="form.description" placeholder="分类描述" />
        </el-form-item>
        <el-form-item label="实验室管理员">
          <el-select
            v-model="form.managerUserId"
            placeholder="请选择实验室管理员"
            clearable
            filterable
            style="width: 100%"
            :loading="usersLoading"
          >
            <el-option
              v-for="u in managerOptions"
              :key="u.userId"
              :label="u.userName"
              :value="u.userId"
            />
          </el-select>
          <div class="helper">
            <span v-if="usersLoading">正在加载用户列表…</span>
            <span v-else-if="managerLoadError" class="err">{{ managerLoadError }}</span>
            <span v-else>可选人数：{{ managerOptions.length }}</span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogLoading" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar :deep(.el-form) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.right {
  margin-left: auto;
}

.op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.edit-form :deep(.el-form-item__label) {
  white-space: nowrap;
}

.helper {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.err {
  color: #f56c6c;
}
</style>

