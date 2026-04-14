<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getAnnouncementApi } from '../../api/announcement'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const detail = ref(null)

const id = computed(() => route.params.id)

const formatDateTime = (v) => {
  if (!v) return '-'
  if (typeof v === 'string') {
    const s = v.replace('T', ' ')
    return s.length >= 16 ? s.slice(0, 16) : s
  }
  try {
    const d = new Date(v)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return String(v)
  }
}

const getPublisherName = (row) => {
  return (
    row?.publisher?.userName ||
    row?.publisher?.userAccount ||
    row?.publisherName ||
    row?.author ||
    row?.creator ||
    '-'
  )
}

const loadDetail = async () => {
  loading.value = true
  try {
    detail.value = await getAnnouncementApi(id.value)
  } catch (e) {
    ElMessage.error(e.message || '加载公告详情失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<template>
  <el-card shadow="never" v-loading="loading">
    <template #header>
      <div class="header">
        <div class="title-box">
          <div class="title">{{ detail?.title || '公告详情' }}</div>
          <div class="meta">
            <span>发布人：{{ getPublisherName(detail) }}</span>
            <span class="sep">|</span>
            <span>发布时间：{{ formatDateTime(detail?.publishTime || detail?.createdAt || detail?.createTime) }}</span>
          </div>
        </div>
        <el-button @click="router.back()">返回</el-button>
      </div>
    </template>

    <div class="content">
      <pre class="pre">{{ detail?.content || '' }}</pre>
    </div>
  </el-card>
</template>

<style scoped>
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.meta {
  font-size: 12px;
  color: #909399;
}

.sep {
  margin: 0 8px;
}

.content {
  padding: 4px 0;
}

.pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  color: #606266;
  line-height: 1.8;
}
</style>

