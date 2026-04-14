<script setup>
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listLabsApi } from '../../api/lab'
import { listLabCategoriesApi } from '../../api/labCategory'
import { createReservationApi, listReservationsApi } from '../../api/reservation'
import { extractPagedTotal } from '../../utils/pagination'
import {
  shouldRefetchLabsForCurrentFilter,
  subscribeLabsStaleForCategory,
} from '../../utils/labCategoryRefresh'

const loading = ref(false)
const labs = ref([])
const categories = ref([])
const total = ref(0)
const allReservations = ref([]) // 所有预约记录（用于冲突检测）
const userReservations = ref([]) // 当前用户的预约记录

// 预约对话框
const dialogVisible = ref(false)
const reservationSubmitting = ref(false) // 防止重复提交
const currentLab = ref(null)
const reservationForm = reactive({
  date: '',
  purpose: '',
})

const query = reactive({
  name: '',
  categoryId: undefined,
  page: 1,
  size: 12,
})

// 获取当前用户信息
const userInfo = computed(() => {
  const info = localStorage.getItem('userInfo')
  return info ? JSON.parse(info) : {}
})

// 加载分类数据
const loadCategories = async () => {
  try {
    const data = await listLabCategoriesApi()
    categories.value = Array.isArray(data) ? data : data?.records || data?.list || []
  } catch {
    categories.value = []
  }
}

// 获取分类名称（与实验室管理页面保持一致）
const getCategoryName = (categoryId) => {
  if (!categoryId) return '未分类'
  const hit = categories.value.find((c) => Number(c.id) === Number(categoryId))
  return hit?.name || hit?.categoryName || '未分类'
}

// 后端可能返回 userId/user_id/reserverId，labId/lab_id，统一取出用于比较
const getReservationUserId = (r) => r.userId ?? r.user_id ?? r.reserverId ?? r.reserver_id ?? ''
const getReservationLabId = (r) => r.labId ?? r.lab_id ?? ''

// 加载当前用户的预约记录（用于禁止重复预约）
const loadUserReservations = async () => {
  try {
    const userId = userInfo.value?.userId ?? userInfo.value?.id
    if (!userId) {
      userReservations.value = []
      return
    }
    const params = { page: 1, size: 500 }
    if (userId != null) params.userId = userId
    const data = await listReservationsApi(params)
    const records = data?.records ?? data?.list ?? (Array.isArray(data) ? data : []) ?? []
    userReservations.value = records.filter(
      r => String(getReservationUserId(r)) === String(userId)
    )
  } catch {
    userReservations.value = []
  }
}

// 预约是否已释放（不占用实验室）：已拒绝/已取消/已结束，或 status=1 但 useStatusCode=2（使用完成）
const isReservationReleased = (r) => {
  const s = Number(r?.status)
  if (s === 2 || s === 4) return true // 已拒绝、已取消
  if (s === 3) return true // 已结束
  const useCode = r?.useStatusCode ?? r?.useStatus
  if (useCode === 2 || useCode === '2') return true // 使用完成
  if (r?.useStatus === '使用完成' || r?.useStatus === '已结束') return true
  return false
}

// 同一用户、同一实验室、同一日期是否已有有效预约（使用完成的预约不算，可再次预约）
const hasUserReservedLabOnDate = (userId, labId, dateStr) => {
  const uid = String(userId)
  const lid = Number(labId)
  return userReservations.value.some(r => {
    if (String(getReservationUserId(r)) !== uid) return false
    if (Number(getReservationLabId(r)) !== lid) return false
    if (isReservationReleased(r)) return false // 已使用完成/已取消等不占名额
    const rStart = (r.startTime ?? '').toString().slice(0, 10)
    return rStart === dateStr
  })
}

// 同一实验室、同一日期是否已有有效预约（使用完成的预约不算占用，实验室可被新预约）
const isLabOccupiedOnDate = (labId, dateStr) => {
  const lid = Number(labId)
  return allReservations.value.some(r => {
    if (Number(getReservationLabId(r)) !== lid) return false
    if (isReservationReleased(r)) return false // 已使用完成/已结束等不占用
    const s = r.status ?? r.reservationStatus
    if (s !== 0 && s !== 1 && s !== '待审核' && s !== '已通过') return false
    const rStart = (r.startTime ?? '').toString().slice(0, 10)
    return rStart === dateStr
  })
}

// 加载实验室列表
const loadLabs = async () => {
  loading.value = true
  try {
    const data = await listLabsApi({
      page: query.page,
      size: query.size,
      name: query.name,
      categoryId: query.categoryId,
    })
    const records = data?.records || data?.list || data || []
    labs.value = records.map(item => {
      const categoryId = item.categoryId
      const categoryName = item.categoryName || 
                          item.category?.name || 
                          getCategoryName(categoryId)
      
      return {
        id: item.id ?? item.labId,
        code: item.code ?? item.labCode ?? `L-${item.id}`,
        name: item.name ?? item.labName ?? '未命名',
        categoryId: categoryId,
        categoryName: categoryName,
        rawStatus: item.status ?? 1,
        status: formatLabStatus(item.status),
        capacity: item.capacity ?? 40,
        location: item.location ?? '未设置',
        openTime: item.openTime ?? '08:00:00',
        closeTime: item.closeTime ?? '22:00:00',
        description: item.description ?? '',
        equipment: item.equipment ? item.equipment.split(',') : [],
      }
    })
    total.value = extractPagedTotal(data, records.length)
    
    // 加载完实验室后，获取用户已预约的实验室
    await loadUserReservations()
  } catch (e) {
    ElMessage.error(e.message || '加载实验室列表失败')
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  query.page = 1
  loadLabs()
}

// 实验室状态（与后端预约 API 一致）：0-停用, 1-正常, 2-维护中。仅 1（正常）可预约
const formatLabStatus = (status) => {
  const n = Number(status)
  if (n === 0) return '停用'
  if (n === 1) return '正常'
  if (n === 2) return '维护中'
  return '正常'
}

// 状态标签类型
const statusTagType = (status) => {
  if (status === '正常') return 'success'
  if (status === '待审核') return 'warning'
  if (status === '停用') return 'info'
  if (status === '维护中') return 'warning'
  return 'info'
}

// 状态颜色
const statusColor = (status) => {
  if (status === '正常') return '#67C23A'
  if (status === '待审核') return '#E6A23C'
  if (status === '停用') return '#909399'
  if (status === '维护中') return '#E6A23C'
  return '#909399'
}

// 加载所有预约记录（用于冲突检测）
// 加载预约记录（用于冲突检测），可传 labId 做预检优化
const loadAllReservations = async (labId) => {
  try {
    const params = { page: 1, size: 1000 }
    if (labId != null) params.labId = labId
    const data = await listReservationsApi(params)
    const records = (data?.records ?? data?.list ?? data) || []
    allReservations.value = records
  } catch {
    allReservations.value = []
  }
}

// 卡片上展示的状态：按实验室状态显示（按日期预约后，不再用「待审核」覆盖）
const displayStatus = (lab) => lab.status

// 是否可点击预约：实验室状态为 1（正常）即可预约（与后端 API 一致）
const canReserve = (lab) => lab.rawStatus === 1


// 将选中的日期统一为 yyyy-MM-dd（el-date-picker 未设 value-format 时返回 Date 对象）
const toDateStr = (val) => {
  if (!val) return ''
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

// 将实验室开放时间格式化为 yyyy-MM-dd HH:mm:ss（后端要求格式）
const toDateTimeStr = (dateStr, timeStr) => {
  const d = toDateStr(dateStr)
  if (!d) return ''
  const t = (timeStr || '08:00:00').toString().trim()
  const normalized = t.length >= 8 ? t.slice(0, 8) : (t.length >= 5 ? `${t}:00`.slice(0, 8) : '08:00:00')
  return `${d} ${normalized}`
}

// 当前实验室已被占用的日期集合（yyyy-MM-dd），用于日期选择器禁用
const occupiedDatesForCurrentLab = computed(() => {
  const labId = currentLab.value?.id
  if (!labId) return new Set()
  const lid = Number(labId)
  const set = new Set()
  allReservations.value.forEach(r => {
    if (Number(getReservationLabId(r)) !== lid) return
    if (isReservationReleased(r)) return
    const rStart = (r.startTime ?? '').toString().slice(0, 10)
    if (rStart.length === 10) set.add(rStart)
  })
  return set
})

// 日期选择器：禁用昨天及更早 + 该实验室已被预约的日期
const disabledReservationDate = (time) => {
  if (time.getTime() < Date.now() - 86400000) return true // 过去日期
  const dateStr = toDateStr(time)
  return dateStr ? occupiedDatesForCurrentLab.value.has(dateStr) : false
}

// 打开预约对话框
const openReserveDialog = async (lab) => {
  if (!canReserve(lab)) {
    ElMessage.warning('该实验室当前不可预约（停用或维护中）')
    return
  }
  currentLab.value = lab
  await loadAllReservations(lab.id) // 拉取该实验室预约，用于禁用已被占用的日期
  const today = new Date()
  reservationForm.date = today.toISOString().split('T')[0]
  reservationForm.purpose = ''
  dialogVisible.value = true
}

// 提交预约（时间段 = 预约日期 + 实验室开放时间）
const submitReservation = async () => {
  if (reservationSubmitting.value) return
  if (!reservationForm.date) {
    ElMessage.warning('请选择预约日期')
    return
  }
  
  const userId = userInfo.value?.userId || userInfo.value?.id
  if (!userId) {
    ElMessage.error('请先登录')
    return
  }
  
  const lab = currentLab.value
  const labId = lab.id
  const date = toDateStr(reservationForm.date)
  if (!date) {
    ElMessage.warning('请选择预约日期')
    return
  }
  // 时间段自动使用实验室开放时间，格式 yyyy-MM-dd HH:mm:ss
  const startStr = toDateTimeStr(date, lab.openTime)
  const endStr = toDateTimeStr(date, lab.closeTime)
  if (!startStr || !endStr) {
    ElMessage.warning('时间格式异常，请重选日期')
    return
  }

  // 提交前重新拉取最新预约数据（按 labId 预检）
  await loadAllReservations(labId)
  await loadUserReservations()

  // 同一用户、同一实验室、同一日期不可重复预约
  if (hasUserReservedLabOnDate(userId, labId, date)) {
    ElMessage.warning('您在该日期已预约过此实验室，请勿重复预约')
    return
  }

  // 同一实验室、同一日期不可重复预约
  if (isLabOccupiedOnDate(labId, date)) {
    ElMessage.warning('该实验室该日期已被预约，请选择其他日期或实验室')
    return
  }

  const reservationData = {
    labId: labId,
    userId: userId,
    startTime: startStr,
    endTime: endStr,
    purpose: (reservationForm.purpose || '实验室预约').trim(),
  }
  
  reservationSubmitting.value = true
  try {
    await createReservationApi(reservationData)
    ElMessage.success('预约成功，等待管理员审核')
    dialogVisible.value = false
    await loadAllReservations()
    await loadUserReservations()
    await loadLabs()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '预约失败'
    ElMessage.error(msg)
  } finally {
    reservationSubmitting.value = false
  }
}

// 搜索
const handleSearch = () => {
  query.page = 1
  loadLabs()
}

// 重置
const handleReset = () => {
  query.name = ''
  query.categoryId = undefined
  query.page = 1
  loadLabs()
}

const handlePageChange = () => {
  loadLabs()
}

const unsubLabsStale = subscribeLabsStaleForCategory((staleCategoryId) => {
  if (shouldRefetchLabsForCurrentFilter(query.categoryId, staleCategoryId)) {
    loadLabs()
  }
})

onMounted(async () => {
  await loadCategories()
  await new Promise(resolve => setTimeout(resolve, 100)) // 等待分类数据完全加载
  await loadLabs()
  await loadAllReservations() // 加载所有预约用于冲突检测
})

onUnmounted(() => {
  unsubLabsStale()
})
</script>

<template>
  <div class="lab-page">
    <!-- 查询区域 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true">
        <el-form-item label="实验室分类">
          <el-select
            v-model="query.categoryId"
            placeholder="请选择实验室分类"
            clearable
            style="width: 180px"
          >
            <el-option
              v-for="cat in categories"
              :key="cat.id ?? cat.categoryId"
              :label="cat.name ?? cat.categoryName"
              :value="cat.id ?? cat.categoryId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="实验室编号">
          <el-input
            v-model="query.name"
            placeholder="请输入实验室编号"
            clearable
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 实验室卡片列表 -->
    <div v-loading="loading" class="lab-grid">
      <el-row :gutter="16">
        <el-col
          v-for="lab in labs"
          :key="lab.id"
          :xs="24"
          :sm="12"
          :md="8"
          :lg="6"
        >
          <div class="lab-card">
            <div class="lab-card-content">
              <div class="lab-info-row">
                <span class="lab-label">实验室编号：</span>
                <span class="lab-code">{{ lab.code }}</span>
              </div>
              <div class="lab-info-row">
                <span class="lab-label">名称：</span>
                <span class="lab-value">{{ lab.name }}</span>
              </div>
              <div class="lab-info-row">
                <span class="lab-label">类型：</span>
                <span class="lab-value">{{ lab.categoryName }}</span>
              </div>
              <div class="lab-info-row">
                <span class="lab-label">状态：</span>
                <span class="lab-status" :style="{ color: statusColor(displayStatus(lab)) }">{{ displayStatus(lab) }}</span>
              </div>
              <div class="lab-info-row">
                <span class="lab-label">开放时间：</span>
                <span class="lab-time">{{ (lab.openTime || '').slice(0, 5) }} - {{ (lab.closeTime || '').slice(0, 5) }}</span>
              </div>
              <div class="lab-action">
                <el-button
                  type="primary"
                  size="small"
                  :disabled="!canReserve(lab)"
                  @click="openReserveDialog(lab)"
                >
                  预约
                </el-button>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.size"
        :page-sizes="[12, 24, 48, 96]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 预约对话框 -->
    <el-dialog
      v-model="dialogVisible"
      title="预约实验室"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="实验室">
          <span style="font-weight: bold; color: #409EFF;">{{ currentLab?.name }}</span>
        </el-form-item>
        <el-form-item label="预约日期" required>
          <el-date-picker
            v-model="reservationForm.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
            :disabled-date="disabledReservationDate"
          />
        </el-form-item>
        <el-form-item v-if="currentLab" label="使用时段">
          <span class="time-hint">{{ (currentLab.openTime || '').slice(0, 5) }} - {{ (currentLab.closeTime || '').slice(0, 5) }}</span>
          <span class="time-hint-desc">（实验室开放时间）</span>
        </el-form-item>
        <el-form-item label="预约用途">
          <el-input
            v-model="reservationForm.purpose"
            type="textarea"
            :rows="2"
            placeholder="请输入预约用途（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false" :disabled="reservationSubmitting">取 消</el-button>
        <el-button type="primary" :loading="reservationSubmitting" @click="submitReservation">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.lab-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-card {
  margin-bottom: 4px;
}

.lab-grid {
  margin-top: 4px;
}

/* 实验室卡片样式 */
.lab-card {
  background: linear-gradient(135deg, #e8f4fc 0%, #d6eaf8 100%);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #c5e1f3;
  transition: all 0.3s ease;
}

.lab-card:hover {
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.lab-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lab-info-row {
  display: flex;
  align-items: baseline;
  font-size: 14px;
}

.lab-label {
  color: #606266;
  min-width: 80px;
  flex-shrink: 0;
}

.lab-code {
  color: #409eff;
  font-weight: 600;
}

.lab-value {
  color: #303133;
}

.lab-status {
  font-weight: 600;
}

.lab-time {
  color: #606266;
}

.lab-action {
  margin-top: 12px;
  text-align: center;
}

.time-hint {
  color: #409eff;
  font-weight: 500;
}
.time-hint-desc {
  color: #909399;
  font-size: 12px;
  margin-left: 6px;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>


