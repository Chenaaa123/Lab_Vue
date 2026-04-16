<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createLabApi,
  deleteLabApi,
  listLabsApi,
  listLabsByManagerApi,
  updateLabApi,
} from '../../api/lab'
import { resolveLabManagerUserId } from '../../utils/labLookup'
import { listLabCategoriesApi } from '../../api/labCategory'
import { listUsersApi } from '../../api/user'
import { extractPagedTotal } from '../../utils/pagination'
import {
  notifyLabsStaleForCategory,
  shouldRefetchLabsForCurrentFilter,
  subscribeLabsStaleForCategory,
} from '../../utils/labCategoryRefresh'

const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')
const isLabManager = computed(() => role.value === '实验室管理员')
const currentUserId = computed(() => {
  const userInfo = localStorage.getItem('userInfo')
  if (userInfo) {
    const parsed = JSON.parse(userInfo)
    return parsed.userId || parsed.id
  }
  return null
})

const loading = ref(false)
const categoryLoading = ref(false)
const usersLoading = ref(false)

const query = reactive({
  name: '',
  categoryId: undefined,
  status: undefined, // 0-停用, 1-正常, 2-维护中
  page: 1,
  size: 10,
})

const tableData = ref([])
const selectedRows = ref([])
const total = ref(0)
const categories = ref([])
const managerOptions = ref([])
const managerLoadError = ref('')

const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogMode = ref('create') // create | edit
const currentId = ref(null)

const form = reactive({
  name: '',
  code: '',
  categoryId: null,
  status: 1,
  capacity: 40,
  location: '',
  equipment: '',
  openTime: '',
  closeTime: '',
  description: '',
  imageUrl: '',
  managerUserId: null,
})

const normalizePaged = (data) => {
  if (Array.isArray(data)) return { records: data, total: data.length }
  const records = data?.records || data?.list || data?.items || []
  const t = extractPagedTotal(data, Array.isArray(records) ? records.length : 0)
  return { records, total: t }
}

const loadCategories = async () => {
  categoryLoading.value = true
  try {
    const data = await listLabCategoriesApi()
    categories.value = Array.isArray(data) ? data : data?.records || data?.list || data?.items || []
  } catch {
    categories.value = []
  } finally {
    categoryLoading.value = false
  }
}

const normalizeList = (data) => {
  if (Array.isArray(data)) return data
  return data?.records || data?.list || data?.items || []
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
          r === 'LAB_MANAGER' ||
          r === 'LabManager' ||
          r.includes('实验室管理员')
        )
      })

    // 如果后端 role 字段不一致导致过滤为空，先兜底展示全部用户，避免下拉无数据
    if (filtered.length === 0 && all.length > 0) {
      ElMessage.warning('未筛选到"实验室管理员"角色用户，已临时展示全部用户（请确认后端 role 字段值）')
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

const getCategoryManagerId = (c) => {
  return (
    c?.managerUserId ??
    c?.managerId ??
    c?.manager_id ??
    c?.manager?.userId ??
    c?.manager?.id ??
    null
  )
}

/** 实验室管理员仅可操作「自己任管实验室分类」下的数据；筛选与新增表单共用此项 */
const managedCategories = computed(() => {
  if (!isLabManager.value || currentUserId.value == null || currentUserId.value === '') {
    return categories.value
  }
  const uid = Number(currentUserId.value)
  return (categories.value || []).filter((c) => {
    const mid = getCategoryManagerId(c)
    return mid != null && Number(mid) === uid
  })
})

const categorySelectOptions = computed(() =>
  isLabManager.value ? managedCategories.value : categories.value,
)

const getCategoryName = (row) => {
  const id = row?.categoryId ?? row?.category?.id ?? row?.category_id
  if (!id) return row?.categoryName || '-'
  const hit = categories.value.find((c) => Number(c.id) === Number(id))
  return hit?.name || hit?.categoryName || row?.categoryName || `分类#${id}`
}

const statusText = (v) => {
  const n = Number(v)
  if (n === 0) return '停用'
  if (n === 1) return '正常'
  if (n === 2) return '维护中'
  return String(v ?? '-')
}

const statusTagType = (v) => {
  const n = Number(v)
  if (n === 0) return 'info'
  if (n === 1) return 'success'
  if (n === 2) return 'warning'
  return 'info'
}

const getLabManagerDisplayName = (row) => {
  const name =
    row?.manager_id?.userName ||
    row?.manager_id?.name ||
    row?.manager?.userName ||
    row?.manager?.name ||
    row?.managerName ||
    row?.labManagerName ||
    row?.admin?.userName ||
    row?.admin?.name ||
    row?.adminName ||
    ''
  if (name) return name
  const mid = resolveLabManagerUserId(row)
  if (mid != null && mid !== '') {
    const u = managerOptions.value.find((x) => Number(x.userId) === Number(mid))
    return u?.userName || `用户#${mid}`
  }
  return '-'
}

const loadList = async () => {
  loading.value = true
  try {
    const params = {
      page: query.page,
      size: query.size,
      name: query.name || undefined,
      categoryId: query.categoryId || undefined,
      status: typeof query.status === 'undefined' ? undefined : query.status,
    }
    let data
    if (isLabManager.value && currentUserId.value) {
      data = await listLabsByManagerApi(currentUserId.value, params)
    } else {
      data = await listLabsApi(params)
    }
    const normalized = normalizePaged(data)
    tableData.value = normalized.records
    total.value = normalized.total
  } catch (e) {
    ElMessage.error(e.message || '加载实验室列表失败')
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  query.page = 1
  loadList()
}

const resetQuery = () => {
  query.name = ''
  query.categoryId = undefined
  query.status = undefined
  query.page = 1
  query.size = 10
  loadList()
}

const openCreate = async () => {
  dialogMode.value = 'create'
  currentId.value = null
  form.name = ''
  form.code = ''
  form.categoryId = null
  form.status = 1 // 默认正常（可预约）
  form.openTime = ''
  form.closeTime = ''
  form.location = ''
  form.equipment = ''
  form.description = ''
  form.imageUrl = ''
  form.managerUserId = null
  dialogVisible.value = true
}

const openEdit = async (row) => {
  dialogMode.value = 'edit'
  currentId.value = row.id
  form.name = row.name || ''
  form.code = row.code || ''
  form.categoryId = row.categoryId ?? row.category?.id ?? null
  form.status = row.status ?? 1
  form.openTime = row.openTime || ''
  form.closeTime = row.closeTime || ''
  form.location = row.location || ''
  form.equipment = row.equipment || ''
  form.description = row.description || ''
  form.imageUrl = row.imageUrl || ''
  form.managerUserId = resolveLabManagerUserId(row) ?? null
  dialogVisible.value = true
}

const submit = async () => {
  if (!form.code.trim()) {
    ElMessage.warning('实验室编号不能为空')
    return
  }
  // “实验室介绍”可以为空，但若填写则同时作为名称
  if (!form.openTime?.trim?.()) {
    ElMessage.warning('请选择开始时间')
    return
  }
  if (!form.closeTime?.trim?.()) {
    ElMessage.warning('请选择闭门时间')
    return
  }
  if (!form.categoryId) {
    ElMessage.warning('请选择实验室分类')
    return
  }
  // 自动从分类获取管理员
  const selectedCategory = categories.value.find(c => Number(c.id) === Number(form.categoryId))
  const managerId = getCategoryManagerId(selectedCategory)
  if (!selectedCategory || !managerId) {
    ElMessage.warning('所选分类未设置管理员，请先设置分类管理员')
    return
  }
  form.managerUserId = managerId

  dialogLoading.value = true
  try {
    const mid = Number(form.managerUserId)
    const payload = {
      name: form.code.trim(),
      code: form.code.trim(),
      categoryId: form.categoryId,
      status: form.status,
      openTime: form.openTime?.trim?.() || undefined,
      closeTime: form.closeTime?.trim?.() || undefined,
      location: form.location?.trim?.() || undefined,
      equipment: form.equipment?.trim?.() || undefined,
      description: form.description?.trim?.() || undefined,
      imageUrl: form.imageUrl?.trim?.() || undefined,
      managerUserId: mid,
      managerId: mid,
    }

    if (dialogMode.value === 'create') {
      await createLabApi(payload)
      ElMessage.success('新增成功')
    } else {
      await updateLabApi(currentId.value, payload)
      ElMessage.success('保存成功')
    }

    notifyLabsStaleForCategory(form.categoryId ?? null)

    dialogVisible.value = false
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '提交失败')
  } finally {
    dialogLoading.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该实验室吗？删除后无法恢复。', '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteLabApi(row.id)
    ElMessage.success('删除成功')
    notifyLabsStaleForCategory(
      row.categoryId ?? row.category?.id ?? row.category_id ?? null,
    )
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e.message || '删除失败')
  }
}

const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

const batchDelete = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请选择要删除的实验室')
    return
  }
  const names = selectedRows.value.map((r) => r.code || r.name || `#${r.id}`).join('、')
  try {
    await ElMessageBox.confirm(
      `确认删除以下 ${selectedRows.value.length} 个实验室吗？\n${names}\n删除后无法恢复。`,
      '批量删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    let successCount = 0
    let failCount = 0
    for (const row of selectedRows.value) {
      try {
        await deleteLabApi(row.id)
        successCount++
      } catch (e) {
        failCount++
        console.error(`删除实验室 ${row.code || row.name} 失败:`, e)
      }
    }
    if (successCount > 0) ElMessage.success(`成功删除 ${successCount} 个实验室`)
    if (failCount > 0) ElMessage.warning(`${failCount} 个实验室删除失败`)
    selectedRows.value = []
    if (successCount > 0) notifyLabsStaleForCategory(null)
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e.message || '批量删除失败')
  }
}

const categoryManagerName = computed(() => {
  if (!form.categoryId) return ''
  const category = categories.value.find(c => Number(c.id) === Number(form.categoryId))
  const managerId = getCategoryManagerId(category)
  if (!managerId) return ''
  const manager = managerOptions.value.find(u => Number(u.userId) === Number(managerId))
  return manager?.userName || `用户#${managerId}`
})

const onCategoryChange = () => {
  if (!form.categoryId) {
    form.managerUserId = null
    return
  }
  const selectedCategory = categories.value.find(c => Number(c.id) === Number(form.categoryId))
  form.managerUserId = getCategoryManagerId(selectedCategory)
}

const getRowNo = (index) => (query.page - 1) * query.size + index + 1

/** 是否可对该实验室进行编辑/删除：系统管理员全部可操作；实验室管理员仅自己管辖的 */
const canOperateLab = (row) => {
  if (isAdmin.value) return true
  if (!isLabManager.value) return false
  const mid = resolveLabManagerUserId(row)
  return Number(mid) === Number(currentUserId.value)
}

const unsubLabsStale = subscribeLabsStaleForCategory((staleCategoryId) => {
  if (shouldRefetchLabsForCurrentFilter(query.categoryId, staleCategoryId)) {
    loadList()
  }
})

onMounted(async () => {
  await loadCategories()
  await loadManagers()
  await loadList()
})

onUnmounted(() => {
  unsubLabsStale()
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item>
          <el-input
            v-model="query.name"
            placeholder="请输入实验室编号"
            clearable
            style="width: 260px"
            @keyup.enter="() => { query.page = 1; loadList() }"
          />
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="query.categoryId"
            placeholder="请选择分类"
            clearable
            filterable
            style="width: 200px"
            :loading="categoryLoading"
          >
            <el-option
              v-for="c in categorySelectOptions"
              :key="c.id"
              :label="c.name || c.categoryName"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select
            v-model="query.status"
            placeholder="状态"
            clearable
            style="width: 120px"
          >
            <el-option label="停用" :value="0" />
            <el-option label="正常" :value="1" />
            <el-option label="维护中" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item class="toolbar-actions">
          <el-button type="primary" @click="() => { query.page = 1; loadList() }">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
          <el-button
            type="danger"
            :disabled="(!isAdmin && !isLabManager) || selectedRows.length === 0"
            @click="batchDelete"
          >
            批量删除
          </el-button>
          <!-- 系统管理员与实验室管理员均可新增；实验室管理员仅能选择任管分类 -->
          <el-button
            v-if="isAdmin || isLabManager"
            type="primary"
            :disabled="isLabManager && managedCategories.length === 0"
            @click="openCreate"
          >
            新增
          </el-button>
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
        <el-table-column prop="code" label="实验室编号" min-width="110" />
        <el-table-column label="开始时间" width="100" align="center">
          <template #default="{ row }">
            {{ row.openTime || '--:--:--' }}
          </template>
        </el-table-column>
        <el-table-column label="闭门时间" width="100" align="center">
          <template #default="{ row }">
            {{ row.closeTime || '--:--:--' }}
          </template>
        </el-table-column>
        <el-table-column label="使用状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="所属分类" min-width="130">
          <template #default="{ row }">
            {{ getCategoryName(row) }}
          </template>
        </el-table-column>
        <el-table-column label="实验室管理员" min-width="120">
          <template #default="{ row }">
            {{ getLabManagerDisplayName(row) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <!-- 系统管理员全部可操作；实验室管理员仅能操作自己管辖的实验室 -->
            <el-button
              size="small"
              type="primary"
              :disabled="!canOperateLab(row)"
              @click="openEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="!canOperateLab(row)"
              @click="removeRow(row)"
            >
              删除
            </el-button>
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
          @size-change="handleSizeChange"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="实验室信息表"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-form label-width="120px" class="lab-form">
        <el-form-item label="实验室编号" required>
          <el-input v-model="form.code" placeholder="实验室编号" />
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-time-picker
            v-model="form.openTime"
            placeholder="请选择时间"
            style="width: 100%"
            format="HH:mm:ss"
            value-format="HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="闭门时间" required>
          <el-time-picker
            v-model="form.closeTime"
            placeholder="请选择时间"
            style="width: 100%"
            format="HH:mm:ss"
            value-format="HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="实验室状态" required>
          <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
            <el-option label="停用" :value="0" />
            <el-option label="正常" :value="1" />
            <el-option label="维护中" :value="2" />
          </el-select>
          <div class="helper">正常：可预约；停用/维护中：不可预约</div>
        </el-form-item>
        <el-form-item label="所属分类" required>
          <el-select
            v-model="form.categoryId"
            placeholder="请选择实验室分类"
            filterable
            style="width: 100%"
            :loading="categoryLoading"
            @change="onCategoryChange"
          >
            <el-option
              v-for="c in categorySelectOptions"
              :key="c.id"
              :label="c.name || c.categoryName"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="实验室管理员">
          <el-input
            :model-value="categoryManagerName"
            readonly
            placeholder="请先选择所属分类"
            style="width: 100%"
          />
          <div class="helper">管理员从所属分类自动获取</div>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="form.location" placeholder="实验室位置（可选）" />
        </el-form-item>
        <el-form-item label="主要设备">
          <el-input
            v-model="form.equipment"
            type="textarea"
            :rows="2"
            placeholder="主要设备清单，逗号分隔（可选）"
          />
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="实验室详细描述（可选）"
          />
        </el-form-item>
        <el-form-item label="图片地址">
          <el-input v-model="form.imageUrl" placeholder="实验室图片 URL（可选）" />
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
  padding: 16px;
}

.toolbar {
  margin-bottom: 16px;
  padding: 16px;
  background-color: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 8px;
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

.helper {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.err {
  color: #f56c6c;
}

.lab-form :deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
