<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { listRepairsApi, createRepairApi } from '../../api/repair'
import { listLabsApi } from '../../api/lab'
import { extractPagedTotal } from '../../utils/pagination'
import { subscribeLabsStaleForCategory } from '../../utils/labCategoryRefresh'
import { toListApiRole } from '../../utils/apiRole'
import { extractLabId, findLabById } from '../../utils/labLookup'

const route = useRoute()
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

const dialogVisible = ref(false)
const submitting = ref(false)
const form = reactive({
  labId: null,
  title: '',
  description: '',
  reservationId: null,
})

const userInfo = computed(() => {
  const info = localStorage.getItem('userInfo')
  return info ? JSON.parse(info) : {}
})

const loadLabs = async () => {
  try {
    const data = await listLabsApi({ page: 1, size: 200 })
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
  if (n === 1) return '处理中'
  if (n === 2) return '已处理'
  return status ?? '-'
}

const loadRepairs = async () => {
  loading.value = true
  try {
    const userId = userInfo.value?.userId ?? userInfo.value?.id
    if (userId == null || userId === '') {
      repairs.value = []
      total.value = 0
      ElMessage.warning('未获取到用户信息，请重新登录')
      return
    }
    const uiRole = localStorage.getItem('role') || userInfo.value?.role || ''
    const params = {
      page: query.page,
      size: query.size,
      userId,
      role: toListApiRole(uiRole),
    }
    if (query.status != null && query.status !== '') params.status = query.status
    if (query.labId != null && query.labId !== '') {
      params.labId = query.labId
      params.lab_id = query.labId
    }

    const data = await listRepairsApi(params)
    const records = data?.records || data?.list || data || []
    repairs.value = records.map((r) => {
      const lid = extractLabId(r)
      return {
        id: r.id ?? r.repairId,
        labId: lid,
        labName: r.labName || getLabName(lid),
        title: r.title || '-',
        description: r.description || '-',
        status: r.status,
        statusText: getStatusText(r.status),
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

const handlePageChange = () => {
  loadRepairs()
}

const handleSizeChange = () => {
  query.page = 1
  loadRepairs()
}

const openCreate = () => {
  form.labId = route.query.labId ? Number(route.query.labId) : null
  form.title = ''
  form.description = ''
  form.reservationId = route.query.reservationId ? Number(route.query.reservationId) : null
  dialogVisible.value = true
}

const submitRepair = async () => {
  if (!form.title?.trim()) {
    ElMessage.warning('请输入报修标题')
    return
  }
  if (!form.labId) {
    ElMessage.warning('请选择实验室')
    return
  }

  submitting.value = true
  try {
    const payload = {
      userId: userInfo.value?.userId ?? userInfo.value?.id,
      labId: form.labId,
      title: form.title.trim(),
    }
    if (form.description?.trim()) payload.description = form.description.trim()
    if (form.reservationId) payload.reservationId = form.reservationId

    await createRepairApi(payload)
    ElMessage.success('报修提交成功')
    dialogVisible.value = false
    await loadRepairs()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '提交失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

const unsubLabsStale = subscribeLabsStaleForCategory(() => {
  loadLabs()
})

onMounted(async () => {
  await loadLabs()
  await loadRepairs()
  if (route.query.reservationId && route.query.labId) {
    form.labId = Number(route.query.labId)
    form.reservationId = Number(route.query.reservationId)
    dialogVisible.value = true
  }
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
          <el-select v-model="query.labId" placeholder="请选择实验室编号" clearable style="width: 180px">
            <el-option 
              v-for="lab in labs" 
              :key="lab.id ?? lab.labId" 
              :label="lab.code || lab.labCode" 
              :value="lab.id ?? lab.labId" 
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="query.status" placeholder="状态" clearable style="width: 100px">
            <el-option label="待处理" :value="0" />
            <el-option label="处理中" :value="1" />
            <el-option label="已完成" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadRepairs">查询</el-button>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="openCreate">新增报修</el-button>
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
        <el-table-column prop="title" label="报修标题" min-width="180" />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'warning' : row.status === 1 ? 'primary' : 'success'" size="small">
              {{ row.statusText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="报修时间" width="170" />
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

    <el-dialog v-model="dialogVisible" title="新增报修" width="480px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="实验室" required>
          <el-select v-model="form.labId" placeholder="请选择实验室" style="width: 100%">
            <el-option
              v-for="l in labs"
              :key="l.id ?? l.labId"
              :label="(l.name || l.labName) + ' - ' + (l.code || l.labCode)"
              :value="l.id ?? l.labId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="报修标题" required>
          <el-input v-model="form.title" placeholder="请输入报修标题" />
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请描述故障情况（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitRepair">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.repair-page { display: flex; flex-direction: column; gap: 16px; }
.toolbar { margin-bottom: 0; }
.pager { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
