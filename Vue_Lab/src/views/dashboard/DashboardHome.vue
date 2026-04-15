<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { getAnnouncementApi, listAnnouncementsApi } from '../../api/announcement'
import { listLabsApi, listLabsByManagerApi } from '../../api/lab'
import { listLabCategoriesApi } from '../../api/labCategory'
import { subscribeLabsStaleForCategory } from '../../utils/labCategoryRefresh'

const router = useRouter()

// 图表实例变量
let pieChart = null
let barChart = null
const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')
const isLabManager = computed(() => role.value === '实验室管理员')
const isStudentOrTeacher = computed(() => role.value === '老师' || role.value === '学生')
const currentUserId = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return p.userId ?? p.id ?? null
  } catch {
    return null
  }
})
const username = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return parsed.userName || '用户'
    } catch {
      return '用户'
    }
  }
  return '用户'
})

const annLoading = ref(false)
const announcements = ref([])

const labsLoading = ref(false)
const labs = ref([])
const categories = ref([])

// 实验室状态统计（0-停用, 1-正常, 2-维护中）— 饼图用全量
const labStats = computed(() => {
  const total = labs.value.length
  const disabled = labs.value.filter(l =>
    l.status === 0 || l.status === '停用' || l.labStatus === 0
  ).length
  const normal = labs.value.filter(l =>
    l.status === 1 || l.status === '正常' || l.labStatus === 1
  ).length
  const maintenance = labs.value.filter(l =>
    l.status === 2 || l.status === '维护中' || l.labStatus === 2
  ).length
  const other = total - disabled - normal - maintenance
  return { total, disabled, normal, maintenance, other }
})

const parseLabStatusKey = (lab) => {
  const s = lab?.status ?? lab?.labStatus
  if (s === 0 || s === '停用') return 'disabled'
  if (s === 2 || s === '维护中') return 'maintenance'
  return 'normal'
}

/** 横轴为各实验室分类，堆叠：正常 / 停用 / 维护中（不含未分类实验室） */
const categoryBarStats = computed(() => {
  const idToName = new Map()
  for (const c of categories.value) {
    const id = Number(c.id)
    if (!Number.isFinite(id)) continue
    idToName.set(id, c.name || c.categoryName || `分类#${id}`)
  }

  const buckets = new Map()

  for (const c of categories.value) {
    const id = Number(c.id)
    if (!Number.isFinite(id)) continue
    const k = `c_${id}`
    buckets.set(k, {
      key: k,
      name: idToName.get(id) || `分类#${id}`,
      normal: 0,
      disabled: 0,
      maintenance: 0,
    })
  }

  for (const lab of labs.value) {
    const cid = lab.categoryId ?? lab.category?.id ?? lab.category_id
    if (cid == null || cid === '') continue

    const n = Number(cid)
    const key = `c_${n}`
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        name: idToName.get(n) || `分类#${n}`,
        normal: 0,
        disabled: 0,
        maintenance: 0,
      })
    }
    const b = buckets.get(key)
    b[parseLabStatusKey(lab)] += 1
  }

  const ordered = []
  const sortedCats = [...categories.value].sort(
    (a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0),
  )
  for (const c of sortedCats) {
    const k = `c_${Number(c.id)}`
    if (buckets.has(k)) ordered.push(buckets.get(k))
  }
  const seen = new Set(ordered.map((r) => r.key))
  for (const [k, v] of buckets) {
    if (seen.has(k)) continue
    ordered.push(v)
  }

  return ordered
})

const parseTime = (v) => {
  if (!v) return null
  if (typeof v === 'string') {
    const s = v.replace('T', ' ')
    const ms = Date.parse(s)
    if (!Number.isNaN(ms)) return new Date(ms)
    return null
  }
  if (v instanceof Date) return v
  try {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const formatDate = (v) => {
  if (!v) return '-'
  if (typeof v === 'string') return v.slice(0, 10)
  const d = parseTime(v)
  if (!d) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const getContentText = (row) => {
  const v =
    row?.content ??
    row?.contentText ??
    row?.contentPreview ??
    row?.summary ??
    row?.body ??
    row?.detail ??
    row?.description ??
    row?.announcement?.content ??
    row?.announcement?.summary ??
    ''
  const s = String(v ?? '').trim()
  return s || '（无内容）'
}

const enrichContentForHome = async (records) => {
  const need = (records || []).filter((r) => getContentText(r) === '（无内容）' && r?.id)
  if (need.length === 0) return
  await Promise.all(
    need.map(async (r) => {
      try {
        const detail = await getAnnouncementApi(r.id)
        r.content = detail?.content ?? detail?.contentText ?? r.content
      } catch {
        // ignore
      }
    }),
  )
}

const loadHomeAnnouncements = async () => {
  annLoading.value = true
  try {
    const data = await listAnnouncementsApi({ page: 1, size: 10 })
    const records = (data?.records || data?.list || data || []).slice?.() || []

    records.sort((a, b) => {
      const ta =
        parseTime(a?.updatedAt || a?.updatedTime || a?.updateTime) ||
        parseTime(a?.publishTime) ||
        parseTime(a?.createdAt || a?.createTime) ||
        new Date(0)
      const tb =
        parseTime(b?.updatedAt || b?.updatedTime || b?.updateTime) ||
        parseTime(b?.publishTime) ||
        parseTime(b?.createdAt || b?.createTime) ||
        new Date(0)
      return tb.getTime() - ta.getTime()
    })

    const top = records.slice(0, 5)
    await enrichContentForHome(top)
    announcements.value = top
  } catch (e) {
    ElMessage.error(e.message || '加载首页公告失败')
  } finally {
    annLoading.value = false
  }
}

const loadCategories = async () => {
  try {
    const data = await listLabCategoriesApi()
    categories.value = Array.isArray(data) ? data : data?.records || data?.list || []
  } catch {
    categories.value = []
  }
}

// 加载实验室数据
const loadLabs = async () => {
  labsLoading.value = true
  try {
    const params = { page: 1, size: 1000 }
    let data
    if (isLabManager.value && currentUserId.value) {
      data = await listLabsByManagerApi(currentUserId.value, params)
    } else {
      data = await listLabsApi(params)
    }
    labs.value = data?.records || data?.list || data || []
  } catch (e) {
    ElMessage.error(e.message || '加载实验室数据失败')
  } finally {
    labsLoading.value = false
  }
}

const goAnnouncement = (item) => {
  router.push(`/announcements/${item.id}`)
}

// 初始化饼图
const initPieChart = () => {
  const chartDom = document.getElementById('pieChart')
  if (!chartDom) return
  pieChart = echarts.init(chartDom)
  updatePieChart()
}

// 初始化柱状图
const initBarChart = () => {
  const chartDom = document.getElementById('barChart')
  if (!chartDom) return
  barChart = echarts.init(chartDom)
  updateBarChart()
}

// 更新饼图数据
const updatePieChart = () => {
  if (!pieChart) return
  const { normal, disabled, maintenance } = labStats.value
  const pieData = [
    { value: normal || 0, name: '正常', itemStyle: { color: '#67C23A' } },
    { value: disabled || 0, name: '停用', itemStyle: { color: '#909399' } },
    { value: maintenance || 0, name: '维护中', itemStyle: { color: '#E6A23C' } },
  ]
  const pieSeriesData = pieData.filter((item) => item.value > 0)
  const hasPieData = pieSeriesData.length > 0
  const option = {
    color: ['#67C23A', '#909399', '#E6A23C'],
    title: {
      text: '实验室状态统计',
      subtext: '全量实验室 · 按状态占比 · 悬停查看数量与百分比',
      left: 'center',
      top: 8,
      textStyle: { fontSize: 15, fontWeight: 600, color: '#303133' },
      subtextStyle: { fontSize: 11, color: '#909399', lineHeight: 16 },
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 12 },
      formatter(params) {
        if (params.name === '暂无数据') return ''
        const v = Number(params.value) || 0
        const pct = params.percent != null ? params.percent : 0
        return `<div style="font-weight:600;margin-bottom:6px">${params.name}</div><div style="display:flex;align-items:center;gap:8px"><span>${params.marker}</span><span>数量</span><b>${v}</b></div><div style="margin-top:4px;color:#909399;font-size:11px">占比 ${pct}%</div>`
      },
    },
    legend: {
      show: hasPieData,
      data: pieSeriesData.map((item) => item.name),
      bottom: 6,
      left: 'center',
      itemGap: 24,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { fontSize: 12, color: '#606266' },
    },
    series: [
      {
        name: '实验室状态',
        type: 'pie',
        radius: ['42%', '62%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: true,
          color: '#606266',
          fontSize: 11,
          formatter: (p) =>
            p.name === '暂无数据' ? '暂无实验室数据' : `${p.name}\n${p.value} 间`,
        },
        labelLine: {
          show: hasPieData,
          length: 10,
          length2: 8,
          lineStyle: { color: '#C0C4CC' },
        },
        emphasis: {
          disabled: !hasPieData,
          scale: true,
          scaleSize: 4,
          label: { show: true, fontSize: 12, fontWeight: 600 },
        },
        data: hasPieData
          ? pieSeriesData
          : [{ value: 1, name: '暂无数据', itemStyle: { color: '#EBEEF5' } }],
      },
    ],
  }
  pieChart.setOption(option)
}

// 更新柱状图：横轴 = 实验室分类，堆叠各状态数量（防标签重叠、分类多时可滑动）
const updateBarChart = () => {
  if (!barChart) return
  const rows = categoryBarStats.value
  const names = rows.map((r) => r.name)
  const normalData = rows.map((r) => r.normal)
  const disabledData = rows.map((r) => r.disabled)
  const maintenanceData = rows.map((r) => r.maintenance)

  const count = Math.max(names.length, 1)
  const hasData = names.length > 0
  const axisNames = hasData ? names : ['暂无数据']
  const useZoom = count > 5
  const windowEnd = useZoom ? Math.min(100, Math.ceil((6 / count) * 100)) : 100

  const truncateLabel = (s, maxLen = 7) => {
    const str = String(s ?? '')
    return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str
  }

  const option = {
    color: ['#67C23A', '#909399', '#E6A23C'],
    title: {
      text: '各实验室分类状态统计',
      subtext: '堆叠：正常 / 停用 / 维护中 · 悬停查看完整分类名',
      left: 'center',
      top: 8,
      textStyle: { fontSize: 15, fontWeight: 600, color: '#303133' },
      subtextStyle: { fontSize: 11, color: '#909399', lineHeight: 16 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(64, 158, 255, 0.08)' } },
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 12 },
      formatter(params) {
        if (!params?.length) return ''
        const fullName = params[0].axisValue
        let html = `<div style="font-weight:600;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #ebeef5">${fullName}</div>`
        let sum = 0
        for (const p of params) {
          const v = Number(p.value) || 0
          sum += v
          html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span>${p.marker}</span><span style="flex:1">${p.seriesName}</span><b>${v}</b></div>`
        }
        html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #ebeef5;color:#909399;font-size:11px">合计 ${sum} 间实验室</div>`
        return html
      },
    },
    legend: {
      data: ['正常', '停用', '维护中'],
      bottom: useZoom ? 30 : 6,
      left: 'center',
      itemGap: 24,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { fontSize: 12, color: '#606266' },
    },
    grid: {
      left: 18,
      right: 12,
      top: 82,
      bottom: useZoom ? 108 : 44,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: axisNames,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#DCDFE6' } },
      axisLabel: {
        color: '#606266',
        fontSize: 11,
        lineHeight: 14,
        interval: 0,
        rotate: count > 4 ? 30 : 0,
        margin: 14,
        hideOverlap: true,
        formatter: (val) => truncateLabel(val, count > 6 ? 6 : 10),
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '实验室数量',
      // 竖排 + align:right 易把 Y 轴名称压成极窄列，导致「实验室」等字重叠
      nameLocation: 'end',
      nameRotate: 0,
      nameGap: 8,
      nameTextStyle: {
        color: '#909399',
        fontSize: 11,
        lineHeight: 16,
        align: 'left',
        verticalAlign: 'bottom',
      },
      axisLabel: { color: '#909399', fontSize: 11 },
      splitLine: { lineStyle: { type: 'dashed', color: '#EBEEF5' } },
    },
    dataZoom: useZoom
      ? [
          {
            type: 'slider',
            xAxisIndex: 0,
            height: 22,
            bottom: 4,
            start: 0,
            end: windowEnd,
            borderColor: 'transparent',
            backgroundColor: '#f0f2f5',
            fillerColor: 'rgba(64, 158, 255, 0.12)',
            handleSize: '100%',
            handleStyle: { color: '#409eff', borderColor: '#a0cfff' },
            moveHandleSize: 0,
            textStyle: { fontSize: 10, color: '#909399' },
            brushSelect: false,
          },
          {
            type: 'inside',
            xAxisIndex: 0,
            start: 0,
            end: windowEnd,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: false,
          },
        ]
      : [],
    series: [
      {
        name: '正常',
        type: 'bar',
        stack: 'status',
        barMaxWidth: 48,
        barCategoryGap: '35%',
        emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
        data: hasData ? normalData : [0],
        itemStyle: {
          color: '#67C23A',
          borderRadius: [0, 0, 0, 0],
        },
      },
      {
        name: '停用',
        type: 'bar',
        stack: 'status',
        barMaxWidth: 48,
        barCategoryGap: '35%',
        emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
        data: hasData ? disabledData : [0],
        itemStyle: { color: '#909399' },
      },
      {
        name: '维护中',
        type: 'bar',
        stack: 'status',
        barMaxWidth: 48,
        barCategoryGap: '35%',
        emphasis: { focus: 'series', blurScope: 'coordinateSystem' },
        data: hasData ? maintenanceData : [0],
        itemStyle: {
          color: '#E6A23C',
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  }
  barChart.setOption(option, true)
}

// 更新所有图表
const updateCharts = () => {
  if (!pieChart || !barChart) return
  updatePieChart()
  updateBarChart()
}

// 监听窗口大小变化
const handleResize = () => {
  pieChart?.resize()
  barChart?.resize()
}

const unsubLabsStale = subscribeLabsStaleForCategory(() => {
  Promise.all([loadCategories(), loadLabs()]).then(() => {
    if (!pieChart || !barChart) {
      initPieChart()
      initBarChart()
    } else {
      updateCharts()
    }
  })
})

onMounted(() => {
  loadHomeAnnouncements()
  Promise.all([loadCategories(), loadLabs()]).then(() => {
    initPieChart()
    initBarChart()
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  unsubLabsStale()
  window.removeEventListener('resize', handleResize)
  pieChart?.dispose()
  barChart?.dispose()
})

watch([labs, categories], () => {
  updateCharts()
}, { deep: true })
</script>

<template>
  <div class="dashboard">
    <!-- 公告列表 -->
    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="never" v-loading="annLoading">
          <template #header>
            <div class="card-header">
              <span class="title">公告列表</span>
            </div>
          </template>
          <div v-if="announcements.length === 0" class="empty-state">
            <div class="empty-state-icon">📢</div>
            <div class="empty-state-text">暂无公告信息</div>
            <div class="empty-state-desc">系统管理员还未发布任何公告</div>
          </div>
          <el-timeline v-else>
            <el-timeline-item
              v-for="item in announcements"
              :key="item.id"
              :timestamp="formatDate(item.updatedAt || item.updatedTime || item.updateTime || item.publishTime || item.createdAt || item.createTime)"
            >
              <h4 class="ann-title" @click="goAnnouncement(item)">{{ item.title }}</h4>
              <p class="ann-content">{{ getContentText(item) }}</p>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表统计 -->
    <el-row :gutter="16" class="mt16">
      <el-col :span="12">
        <el-card shadow="never" v-loading="labsLoading">
          <div id="pieChart" class="chart-box chart-box--dashboard-chart"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" v-loading="labsLoading">
          <div id="barChart" class="chart-box chart-box--dashboard-chart"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header .title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.mt16 {
  margin-top: 16px;
}

.ann-content {
  margin: 4px 0 0;
  color: #606266;
  font-size: 14px;
  line-height: 1.5;
}

.ann-title {
  margin: 0;
  cursor: pointer;
  color: #303133;
  font-size: 15px;
  font-weight: 500;
}

.ann-title:hover {
  color: #409eff;
}

.chart-box {
  width: 100%;
  border-radius: var(--border-radius-base);
  overflow: hidden;
}

/* 首页左右图表统一高度，与标题/图例留白一致 */
.chart-box--dashboard-chart {
  height: 400px;
  min-height: 400px;
}

/* 图表容器样式优化 */
.el-card {
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-base);
  transition: all 0.3s ease;
}

.el-card:hover {
  box-shadow: var(--shadow-dark);
  transform: translateY(-2px);
}

/* 图表标题样式优化 */
.el-card .card-header .title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

/* 公告时间线样式优化 */
.el-timeline {
  padding-left: 0;
}

.el-timeline-item__timestamp {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.el-timeline-item__content {
  padding-left: var(--spacing-md);
}

.ann-title {
  margin: 0 0 var(--spacing-xs) 0;
  cursor: pointer;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: 500;
  transition: color 0.2s ease;
  line-height: 1.4;
}

.ann-title:hover {
  color: var(--color-primary);
}

.ann-content {
  margin: 0;
  color: var(--color-text-regular);
  font-size: var(--font-size-base);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 图表加载状态 */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 320px;
  color: var(--color-text-secondary);
}

.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 320px;
  color: var(--color-text-secondary);
}

.chart-empty-icon {
  font-size: 48px;
  margin-bottom: var(--spacing-md);
  opacity: 0.5;
}

.chart-empty-text {
  font-size: var(--font-size-base);
  margin-bottom: var(--spacing-sm);
}

.empty-state-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 0;
}
</style>
