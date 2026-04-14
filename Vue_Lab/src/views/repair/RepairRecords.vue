<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { listRepairsApi } from '../../api/repair'
import { createMaintenanceApi } from '../../api/maintenance'
import { listLabsApi, listLabsByManagerApi } from '../../api/lab'
import { extractPagedTotal } from '../../utils/pagination'
import { toListApiRole } from '../../utils/apiRole'
import { subscribeLabsStaleForCategory } from '../../utils/labCategoryRefresh'
import { extractLabId, findLabById } from '../../utils/labLookup'

const router = useRouter()
const loading = ref(false)
const repairs = ref([])
const labs = ref([])
const total = ref(0)

const query = reactive({
  labId: undefined,
  status: undefined,
  page: 1,
  size: 10,
})

const maintenanceDialogVisible = ref(false)
const maintenanceSubmitting = ref(false)
const selectedRepair = ref(null)
const maintenanceForm = reactive({
  repairId: null,
  labId: null,
  handler: '',
  handlerPhone: '',
  content: '',
  result: '',
  maintenanceUnit: '',
  maintenanceTime: '',
})

const userInfo = computed(() => localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')) : {})
const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')
const isLabManager = computed(() => role.value === '实验室管理员')
const currentUserId = computed(() => userInfo.value?.userId || userInfo.value?.id)

const loadLabs = async () => {
  try {
    const params = { page: 1, size: 200 }
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

const loadRepairs = async () => {
  loading.value = true
  try {
    if (currentUserId.value == null || currentUserId.value === '') {
      repairs.value = []
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

    // 状态筛选
    if (query.status != null && query.status !== '') {
      params.status = query.status
    }

    // 实验室筛选（根据后端API设计，只需传递labId参数）
    if (query.labId != null && query.labId !== '') {
      params.labId = query.labId
      params.lab_id = query.labId  // 兼容蛇形命名
    }

    const data = await listRepairsApi(params)
    const records = data?.records || data?.list || data || []

    const now = new Date()

    repairs.value = records.map((r) => {
      const lid = extractLabId(r)
      let status = r.status
      let statusText = getStatusText(r.status)

      // 检查超时状态：如果状态是待处理且报修时间已过（假设24小时为超时），则设为已超时
      if (status === 0 || status === '待处理') {
        const createdAt = r.createdTime || r.createdAt
        if (createdAt) {
          const createdDate = new Date(createdAt)
          const timeoutHours = 24 // 24小时后超时
          const timeoutDate = new Date(createdDate.getTime() + timeoutHours * 60 * 60 * 1000)
          if (timeoutDate < now) {
            status = 2
            statusText = '已超时'
          }
        }
      }

      return {
        id: r.id ?? r.repairId,
        labId: lid,
        labName: r.labName || getLabName(lid),
        userId: r.userId ?? r.reporterId ?? r.user?.userId ?? r.user?.id,
        userName: r.userName || r.reporterName || r.user?.userName || r.user?.name || '-',
        title: r.title || '-',
        description: r.description || '-',
        status: status,
        statusText: statusText,
        createdAt: r.createdTime || r.createdAt || '-',
      }
    })
    total.value = extractPagedTotal(data, records.length)
  } catch (e) {
    ElMessage.error(e.message || '加载报修记录失败')
  } finally {
    loading.value = false
  }
}

// 待处理和已超时状态都可以生成检修
const canCreateMaintenance = (row) => {
  const s = row?.status
  return s === 0 || s === '待处理' || s === 2 || s === '已超时'
}

const handlePageChange = () => {
  loadRepairs()
}

const handleSizeChange = () => {
  query.page = 1
  loadRepairs()
}

const openMaintenanceDialog = (row) => {
  selectedRepair.value = row
  maintenanceForm.repairId = row.id
  maintenanceForm.labId = row.labId
  maintenanceForm.handler = ''
  maintenanceForm.handlerPhone = ''
  maintenanceForm.content = ''
  maintenanceForm.result = ''
  maintenanceForm.maintenanceUnit = ''
  maintenanceForm.maintenanceTime = ''
  maintenanceDialogVisible.value = true
}

const submitMaintenance = async () => {
  if (!maintenanceForm.handler?.trim()) {
    ElMessage.error('请填写检修人')
    return
  }
  if (!maintenanceForm.handlerPhone?.trim()) {
    ElMessage.error('请填写联系电话')
    return
  }
  if (!maintenanceForm.content?.trim()) {
    ElMessage.error('请填写检修说明')
    return
  }
  if (!maintenanceForm.maintenanceUnit?.trim()) {
    ElMessage.error('请填写检修单位')
    return
  }
  if (!maintenanceForm.maintenanceTime) {
    ElMessage.error('请选择检修时间')
    return
  }
  
  maintenanceSubmitting.value = true
  try {
    const payload = {
      repairId: maintenanceForm.repairId,
      labId: maintenanceForm.labId,
      handler: maintenanceForm.handler.trim(),
      handlerPhone: maintenanceForm.handlerPhone.trim(),
      content: maintenanceForm.content.trim(),
      result: '已完成',
      maintenanceUnit: maintenanceForm.maintenanceUnit.trim(),
      maintenanceTime: maintenanceForm.maintenanceTime,
    }

    await createMaintenanceApi(payload)
    ElMessage.success('已创建检修记录')
    maintenanceDialogVisible.value = false
    await loadRepairs()
    router.push('/inspections')
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '创建失败'
    ElMessage.error(msg)
  } finally {
    maintenanceSubmitting.value = false
  }
}

const unsubLabsStale = subscribeLabsStaleForCategory(() => {
  loadLabs()
})

onMounted(async () => {
  await loadLabs()
  await loadRepairs()
})

onUnmounted(() => {
  unsubLabsStale()
})
</script>

<template>
  <div class="repair-page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item>
          <el-select v-model="query.labId" placeholder="实验室编号" clearable style="width: 180px">
            <el-option v-for="l in labs" :key="l.id ?? l.labId" :label="l.code || l.labCode" :value="l.id ?? l.labId" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.status" placeholder="状态" clearable style="width: 100px">
            <el-option label="待处理" :value="0" />
            <el-option label="已处理" :value="1" />
            <el-option label="已超时" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadRepairs">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="repairs" border v-loading="loading">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column label="实验室编号" min-width="140">
          <template #default="{ row }">
            {{ getLabCode(row.labId) }}
          </template>
        </el-table-column>
        <el-table-column prop="userName" label="报修人" width="100" />
        <el-table-column prop="title" label="报修标题" min-width="160" />
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <el-table-column label="报修状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'warning' : row.status === 1 ? 'primary' : 'success'" size="small">
              {{ row.statusText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="报修时间" width="170" />
        <el-table-column v-if="isAdmin || isLabManager" label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              v-if="canCreateMaintenance(row)"
              size="small"
              type="primary"
              @click="openMaintenanceDialog(row)"
            >
              生成检修
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

    <el-dialog v-model="maintenanceDialogVisible" title="填写检修记录" width="480px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="关联报修">
          <span>{{ selectedRepair?.title }} - {{ selectedRepair?.labName }}</span>
        </el-form-item>
        <el-form-item label="检修人" required>
          <el-input v-model="maintenanceForm.handler" placeholder="请输入检修人" />
        </el-form-item>
        <el-form-item label="联系电话" required>
          <el-input v-model="maintenanceForm.handlerPhone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="检修单位" required>
          <el-input v-model="maintenanceForm.maintenanceUnit" placeholder="请输入检修单位" />
        </el-form-item>
        <el-form-item label="检修时间" required>
          <el-date-picker v-model="maintenanceForm.maintenanceTime" type="datetime" placeholder="选择检修时间" format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="检修说明" required>
          <el-input v-model="maintenanceForm.content" type="textarea" :rows="3" placeholder="请输入检修说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="maintenanceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="maintenanceSubmitting" @click="submitMaintenance">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.repair-page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { margin-bottom: 0; }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
