<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listUsersApi,
  deleteUserApi,
  updateUserApi,
  createUserApi,
  changePasswordApi,
} from '../../api/user'
import { extractPagedTotal } from '../../utils/pagination'

const route = useRoute()

const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')

// 根据路由决定展示的用户角色类型
const roleMode = computed(() => {
  const path = route.path
  if (path === '/users/lab-managers') return 'lab_manager'
  if (path === '/users/students' || path === '/users/teachers-students') return 'teacher_student'
  return 'admin' // /users -> 系统管理员
})

const loading = ref(false)
const query = reactive({
  keyword: '',
  page: 1,
  size: 10,
})
const tableData = ref([])
const selectedRows = ref([])
const total = ref(0)

const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogMode = ref('edit') // 'create' | 'edit'
const currentId = ref(null)
const originalRole = ref('')
const form = reactive({
  userAccount: '',
  userName: '',
  role: '',
  password: '',
  avatar: '', // 头像URL
})

const normalizePaged = (data) => {
  if (Array.isArray(data)) return { records: data, total: data.length }
  const records = data?.records || data?.list || data?.items || []
  const t = extractPagedTotal(data, Array.isArray(records) ? records.length : 0)
  return { records, total: t }
}

const matchRole = (userRole, mode) => {
  const r = String(userRole ?? '').trim()
  if (mode === 'admin') {
    return r === '系统管理员' || r === 'ADMIN' || r === 'Admin' || r.includes('系统管理员')
  }
  if (mode === 'lab_manager') {
    return (
      r === '实验室管理员' ||
      r === 'LAB_MANAGER' ||
      r === 'LabManager' ||
      r.includes('实验室管理员')
    )
  }
  if (mode === 'teacher_student') {
    return (
      r === '老师' ||
      r === '学生' ||
      r === 'TEACHER' ||
      r === 'STUDENT' ||
      r === 'Teacher' ||
      r === 'Student' ||
      r.includes('老师') ||
      r.includes('学生')
    )
  }
  return true
}

const isSystemAdminRole = (value) => {
  const r = String(value ?? '').trim()
  return r === '系统管理员' || r === 'ADMIN' || r === 'Admin' || r.includes('系统管理员')
}

const loadList = async () => {
  loading.value = true
  try {
    const params = {
      page: query.page,
      size: query.size,
      keyword: query.keyword || undefined,
    }
    if (roleMode.value === 'admin') params.role = '系统管理员'
    if (roleMode.value === 'lab_manager') params.role = '实验室管理员'
    const data = await listUsersApi(params)
    const normalized = normalizePaged(data)
    let rows = normalized.records || []
    rows = rows.filter((r) =>
      matchRole(r.role ?? r.roleName ?? r.role_code, roleMode.value),
    )
    tableData.value = rows
    // 如果有前端过滤，需要重新计算total
    const hasKeyword = query.keyword && query.keyword.trim()
    const hasRoleFilter = roleMode.value !== 'all'
    if (hasKeyword || hasRoleFilter) {
      // 获取全部数据来计算过滤后的总数
      const allParams = { ...params, page: 1, size: 9999 }
      const allData = await listUsersApi(allParams)
      const allNormalized = normalizePaged(allData)
      let allRows = allNormalized.records || []
      allRows = allRows.filter((r) =>
        matchRole(r.role ?? r.roleName ?? r.role_code, roleMode.value),
      )
      if (hasKeyword) {
        const kw = query.keyword.trim().toLowerCase()
        allRows = allRows.filter((r) => {
          const name = (r.realName ?? r.name ?? r.userName ?? r.userAccount ?? '').toLowerCase()
          const account = (r.userAccount ?? r.userName ?? r.account ?? r.username ?? '').toLowerCase()
          return name.includes(kw) || account.includes(kw)
        })
      }
      total.value = allRows.length
    } else {
      total.value = normalized.total ?? rows.length
    }
  } catch (e) {
    ElMessage.error(e?.message || '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

const resetQuery = () => {
  query.keyword = ''
  query.page = 1
  loadList()
}

// 分页处理函数
const handleSizeChange = (size) => {
  query.size = size
  query.page = 1
  loadList()
}

const handleCurrentChange = () => {
  loadList()
}

const getUsername = (row) =>
  row.userAccount ?? row.userName ?? row.account ?? row.username ?? '-'
const getRealName = (row) =>
  row.realName ?? row.name ?? row.userName ?? row.userAccount ?? '-'
const getRoleLabel = (row) => {
  const r = row.role ?? row.roleName ?? row.role_code ?? ''
  return r || '-'
}
const getAvatar = (row) =>
  row.avatar ?? row.avatarUrl ?? row.image ?? row.avatarUrl

const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

const batchDelete = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请选择要删除的用户')
    return
  }
  const names = selectedRows.value.map((r) => getRealName(r) || getUsername(r)).join('、')
  try {
    await ElMessageBox.confirm(
      `确认删除以下 ${selectedRows.value.length} 个用户吗？\n${names}\n删除后无法恢复。`,
      '批量删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    let successCount = 0
    let failCount = 0
    for (const row of selectedRows.value) {
      try {
        await deleteUserApi(row.userId ?? row.id)
        successCount++
      } catch (e) {
        failCount++
        console.error('删除用户失败:', e)
      }
    }
    if (successCount > 0) ElMessage.success(`成功删除 ${successCount} 个用户`)
    if (failCount > 0) ElMessage.warning(`${failCount} 个用户删除失败`)
    selectedRows.value = []
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e?.message || '批量删除失败')
  }
}

const roleOptions = computed(() => {
  if (roleMode.value === 'admin') return [{ label: '系统管理员', value: '系统管理员' }]
  if (roleMode.value === 'lab_manager') return [{ label: '实验室管理员', value: '实验室管理员' }]
  return [
    { label: '老师', value: '老师' },
    { label: '学生', value: '学生' },
  ]
})

const editableRoleOptions = [
  { label: '实验室管理员', value: '实验室管理员' },
  { label: '老师', value: '老师' },
  { label: '学生', value: '学生' },
]

const roleSelectDisabled = computed(() => {
  return dialogMode.value === 'edit' && isSystemAdminRole(originalRole.value)
})

const dialogRoleOptions = computed(() => {
  if (dialogMode.value === 'edit') {
    if (isSystemAdminRole(originalRole.value)) {
      return [{ label: '系统管理员', value: '系统管理员' }]
    }
    return editableRoleOptions
  }
  return roleOptions.value
})

const openCreate = () => {
  dialogMode.value = 'create'
  currentId.value = null
  originalRole.value = ''
  form.userAccount = ''
  form.userName = ''
  // 若当前角色只有一个可选项，则默认选中
  const opts = roleOptions.value
  form.role = opts.length === 1 ? opts[0].value : ''
  form.password = '12345678'
  form.avatar = '' // 清空头像
  dialogVisible.value = true
}

const openEdit = (row) => {
  dialogMode.value = 'edit'
  currentId.value = row.userId ?? row.id
  form.userAccount = (row.userAccount ?? row.account ?? row.username ?? row.userName ?? '').toString()
  form.userName = (row.realName ?? row.name ?? row.userName ?? row.userAccount ?? '').toString()
  const rowRole = (row.role ?? row.roleName ?? row.role_code ?? '').toString()
  originalRole.value = rowRole
  form.role = rowRole
  form.password = ''
  form.avatar = row.avatar ?? row.avatarUrl ?? '' // 初始化头像
  dialogVisible.value = true
}

// 处理头像文件选择
const handleAvatarChange = (file) => {
  const isJPG = file.raw.type === 'image/jpeg'
  const isPNG = file.raw.type === 'image/png'
  const isLt2M = file.raw.size / 1024 / 1024 < 2

  if (!isJPG && !isPNG) {
    ElMessage.error('头像图片只能是 JPG 或 PNG 格式!')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('头像图片大小不能超过 2MB!')
    return false
  }

  // 本地预览
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    form.avatar = reader.result
    ElMessage.success('图片已选择，将在保存时上传')
  }
  reader.onerror = (error) => {
    ElMessage.error('图片读取失败')
    console.error('FileReader error:', error)
  }
  return false
}

const submitEdit = async () => {
  if (!form.userAccount?.trim()) {
    ElMessage.warning('账号不能为空')
    return
  }
  if (!form.userName?.trim()) {
    ElMessage.warning('姓名不能为空')
    return
  }
  if (!form.role?.trim()) {
    ElMessage.warning('请选择角色')
    return
  }
  if (dialogMode.value === 'edit') {
    if (isSystemAdminRole(originalRole.value) && !isSystemAdminRole(form.role)) {
      ElMessage.warning('系统管理员角色不能修改')
      return
    }
    if (!isSystemAdminRole(originalRole.value) && isSystemAdminRole(form.role)) {
      ElMessage.warning('非系统管理员不能修改为系统管理员')
      return
    }
  }
  dialogLoading.value = true
  try {
    const base = {
      userAccount: form.userAccount.trim(),
      userName: form.userName.trim(),
      role: form.role.trim(),
      avatar: form.avatar || undefined, // 添加头像字段
    }

    if (dialogMode.value === 'create') {
      const payload = {
        ...base,
        password: form.password?.trim() || '12345678',
      }
      await createUserApi(payload)
      ElMessage.success('新增成功，初始密码为 12345678')
    } else {
      await updateUserApi(currentId.value, base)
      if (form.password?.trim()) {
        await changePasswordApi(currentId.value, { password: form.password.trim() })
      }
      ElMessage.success('保存成功')
    }

    dialogVisible.value = false
    await loadList()
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    dialogLoading.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该用户吗？删除后无法恢复。', '提示', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteUserApi(row.userId ?? row.id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e?.message || '删除失败')
  }
}

const getRowNo = (index) => (query.page - 1) * query.size + index + 1

watch(
  () => route.path,
  () => {
    query.page = 1
    loadList()
  },
)

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item>
          <el-input
            v-model="query.keyword"
            placeholder="请输入关键字查询"
            clearable
            style="width: 240px"
            @keyup.enter="() => { query.page = 1; loadList() }"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="() => { query.page = 1; loadList() }">查询</el-button>
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
        <el-table-column label="头像" width="80" align="center">
          <template #default="{ row }">
            <el-avatar
              :size="40"
              :src="getAvatar(row)"
            >
              {{ (getRealName(row) || getUsername(row)).charAt(0) }}
            </el-avatar>
          </template>
        </el-table-column>
        <el-table-column label="账号" min-width="120">
          <template #default="{ row }">
            {{ getUsername(row) }}
          </template>
        </el-table-column>
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }">
            {{ getRealName(row) }}
          </template>
        </el-table-column>
        <el-table-column label="角色标识" width="140" align="center">
          <template #default="{ row }">
            {{ getRoleLabel(row) }}
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
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增用户' : '编辑用户'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <!-- 头像上传 -->
        <el-form-item label="头像">
          <div class="avatar-upload-wrapper">
            <el-avatar :size="80" :src="form.avatar" class="preview-avatar">
              {{ form.userName ? form.userName.charAt(0) : '用户' }}
            </el-avatar>
            <el-upload
              class="avatar-uploader"
              action=""
              :auto-upload="false"
              :show-file-list="false"
              :on-change="handleAvatarChange"
              accept="image/*"
            >
              <el-button type="primary" size="small">选择图片</el-button>
              <template #tip>
                <div class="upload-tip">支持 jpg、png 格式，建议尺寸 200x200</div>
              </template>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="账号" required>
          <el-input v-model="form.userAccount" placeholder="账号" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.userName" placeholder="姓名" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select
            v-model="form.role"
            placeholder="请选择角色"
            style="width: 100%"
            :disabled="roleSelectDisabled"
          >
            <el-option
              v-for="opt in dialogRoleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="dialogMode === 'create' ? '登录密码' : '新密码'">
          <el-input
            v-model="form.password"
            show-password
            :placeholder="dialogMode === 'create' ? '默认 12345678，可修改' : '不修改请留空'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogLoading" @click="submitEdit">确定</el-button>
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

.op-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  justify-content: center;
}

.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

/* 头像上传样式 */
.avatar-upload-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

.preview-avatar {
  border: 2px solid #e4e7ed;
  flex-shrink: 0;
}

.avatar-uploader {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
</style>
