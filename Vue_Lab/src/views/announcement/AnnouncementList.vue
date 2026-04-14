<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAnnouncementApi,
  deleteAnnouncementApi,
  getAnnouncementApi,
  listAnnouncementsApi,
  updateAnnouncementApi,
} from '../../api/announcement'
import { listUsersApi } from '../../api/user'
import { extractPagedTotal } from '../../utils/pagination'

const router = useRouter()

const role = computed(() => localStorage.getItem('role') || '')
const isAdmin = computed(() => role.value === '系统管理员')

const currentUser = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
})

const loading = ref(false)

const query = reactive({
  keyword: '',
  page: 1,
  size: 10,
})

const allRecords = ref([]) // 存储从后端获取的全部数据
const tableData = ref([])
const selectedRows = ref([]) // 存储选中的行
const total = ref(0)
const userNameById = ref({})

const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogMode = ref('create') // create | edit
const currentId = ref(null)
const form = reactive({
  title: '',
  content: '',
})

const parseTime = (v) => {
  if (!v) return null
  if (typeof v === 'string') {
    // 兼容: "2026-03-06T06:12:34.123" / "2026-03-06 06:12:34"
    const s = v.replace('T', ' ')
    const ms = Date.parse(s)
    if (!Number.isNaN(ms)) return new Date(ms)
    // Date.parse 对部分格式不友好时，尽量截取到分钟
    return null
  }
  if (v instanceof Date) return v
  return null
}

const formatDateTime = (v) => {
  if (!v) return '-'
  if (typeof v === 'string') {
    const s = v.replace('T', ' ')
    // 截取到分钟：YYYY-MM-DD HH:mm
    return s.length >= 16 ? s.slice(0, 16) : s
  }
  const d = v instanceof Date ? v : parseTime(v)
  if (!d) return String(v)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const getPublisherName = (row) => {
  const publisherId =
    row?.publisherId ??
    row?.publisher_id ??
    row?.publisher?.userId ??
    row?.publisher?.id ??
    row?.publisher?.user_id ??
    null

  // 优先：用 publisherId 去用户表映射姓名
  if (publisherId && userNameById.value[String(publisherId)]) {
    return userNameById.value[String(publisherId)]
  }

  // 次优：如果发布者就是当前登录用户
  if (publisherId && currentUser.value?.userId && Number(publisherId) === Number(currentUser.value.userId)) {
    return currentUser.value.userName || currentUser.value.userAccount || '-'
  }

  return (
    row?.publisher?.userName ||
    row?.publisher?.userAccount ||
    row?.publisherName ||
    row?.author ||
    row?.creator ||
    (publisherId ? `用户#${publisherId}` : null) ||
    '-'
  )
}

const getContentText = (row) => {
  // 兼容：列表接口可能返回 summary/preview，而详情接口才有 content
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

  if (v === null || typeof v === 'undefined') return '（无内容）'
  const s = String(v).trim()
  return s ? s : '（无内容）'
}

const enrichContentForCurrentPage = async (records) => {
  // 只对当前页做兜底：列表没给 content 时，用详情接口补齐
  // 避免全量请求带来性能问题
  const need = (records || []).filter((r) => {
    const text = getContentText(r)
    return text === '（无内容）' && (r?.id ?? r?.announcementId)
  })

  if (need.length === 0) return

  await Promise.all(
    need.map(async (r) => {
      const id = r.id ?? r.announcementId
      try {
        const detail = await getAnnouncementApi(id)
        // 将正文合并回列表行对象（保持响应式）
        r.content = detail?.content ?? detail?.contentText ?? detail?.body ?? detail?.detail ?? r.content
      } catch {
        // ignore：某条详情失败不影响列表
      }
    }),
  )
}

const normalizeList = (data) => {
  if (Array.isArray(data)) {
    return { records: data, total: data.length }
  }
  const records = data?.records || data?.list || []
  const t = extractPagedTotal(data, Array.isArray(records) ? records.length : 0)
  return { records, total: t }
}

const normalizeUserList = (data) => {
  if (Array.isArray(data)) return data
  return data?.records || data?.list || data?.items || []
}

const loadUsersForNameMap = async () => {
  if (!isAdmin.value) return
  try {
    const data = await listUsersApi({ page: 1, size: 200 })
    const list = normalizeUserList(data)
    const map = {}
    for (const u of list) {
      const id = u?.userId ?? u?.id
      const name = u?.userName ?? u?.name ?? u?.userAccount
      if (id && name) map[String(id)] = name
    }
    userNameById.value = map
  } catch {
    // ignore: 用户接口骨架未实现或无权限时，不影响公告列表展示
  }
}

const loadList = async () => {
  loading.value = true
  try {
    // 从后端获取全部数据（后端可能不支持keyword过滤）
    const data = await listAnnouncementsApi({
      page: 1,
      size: 9999,
      keyword: query.keyword || undefined,
    })
    const normalized = normalizeList(data)
    // 按更新时间倒序排列（updatedAt/updatedTime 无则回退 createdAt）：最近修改/发布排最上面
    let records = (normalized.records || [])
      .slice()
      .sort((a, b) => {
        const ta =
          parseTime(a?.updatedAt || a?.updatedTime || a?.updateTime) ||
          parseTime(a?.createdAt || a?.createTime) ||
          new Date(0)
        const tb =
          parseTime(b?.updatedAt || b?.updatedTime || b?.updateTime) ||
          parseTime(b?.createdAt || b?.createTime) ||
          new Date(0)
        return tb.getTime() - ta.getTime()
      })

    // 有关键词时，先补齐全部记录的content再过滤（列表接口可能不返回content字段）
    const kw = (query.keyword || '').trim().toLowerCase()
    if (kw) {
      await enrichContentForCurrentPage(records)
    }

    // 前端本地关键词过滤（兼容后端不支持keyword的情况）
    if (kw) {
      records = records.filter((r) => {
        const title = (r?.title || '').toLowerCase()
        const content = (getContentText(r) || '').toLowerCase()
        return title.includes(kw) || content.includes(kw)
      })
    }

    allRecords.value = records
    total.value = records.length

    // 前端分页（total 为过滤后的全量条数）
    const start = (query.page - 1) * query.size
    const end = start + query.size
    tableData.value = records.slice(start, end)

    // 无关键词时，补齐当前页正文
    if (!kw) {
      await enrichContentForCurrentPage(tableData.value)
    }
  } catch (e) {
    ElMessage.error(e.message || '加载公告列表失败')
  } finally {
    loading.value = false
  }
}

const resetQuery = () => {
  query.keyword = ''
  query.page = 1
  query.size = 10
  loadList()
}

// 前端分页：切换页码（与 v-model:current-page 同步，仅刷新当前页切片）
const handlePageChange = async () => {
  const start = (query.page - 1) * query.size
  const end = start + query.size
  tableData.value = allRecords.value.slice(start, end)
  const kw = (query.keyword || '').trim()
  if (!kw) {
    await enrichContentForCurrentPage(tableData.value)
  }
}

// 前端分页：切换每页条数
const handleSizeChange = async () => {
  query.page = 1
  const start = 0
  const end = query.size
  tableData.value = allRecords.value.slice(start, end)
  const kw = (query.keyword || '').trim()
  if (!kw) {
    await enrichContentForCurrentPage(tableData.value)
  }
}

// 获取序号
const getRowNo = (index) => (query.page - 1) * query.size + index + 1

const openCreate = () => {
  dialogMode.value = 'create'
  currentId.value = null
  form.title = ''
  form.content = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  dialogMode.value = 'edit'
  currentId.value = row.id
  form.title = row.title || ''
  form.content = getContentText(row) || ''
  dialogVisible.value = true
}

const submit = async () => {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('请填写标题和内容')
    return
  }
  dialogLoading.value = true
  try {
    if (dialogMode.value === 'create') {
      await createAnnouncementApi({
        title: form.title,
        content: form.content,
      })
      ElMessage.success('发布成功')
    } else {
      await updateAnnouncementApi(currentId.value, {
        title: form.title,
        content: form.content,
      })
      ElMessage.success('保存成功')
    }
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
    await ElMessageBox.confirm(
      '确认删除该公告吗？删除后无法恢复。',
      '提示',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
    await deleteAnnouncementApi(row.id)
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
    ElMessage.warning('请选择要删除的公告')
    return
  }

  const titles = selectedRows.value.map((row) => row.title || `#${row.id}`).join('、')

  try {
    await ElMessageBox.confirm(
      `确认删除以下 ${selectedRows.value.length} 条公告吗？\n${titles}\n删除后无法恢复。`,
      '批量删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )

    // 逐个删除
    let successCount = 0
    let failCount = 0
    for (const row of selectedRows.value) {
      try {
        await deleteAnnouncementApi(row.id)
        successCount++
      } catch (e) {
        failCount++
        console.error(`删除公告 ${row.title || `#${row.id}`} 失败:`, e)
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功删除 ${successCount} 条公告`)
    }
    if (failCount > 0) {
      ElMessage.warning(`${failCount} 条公告删除失败`)
    }

    selectedRows.value = [] // 清空选中
    await loadList()
  } catch (e) {
    if (e === 'cancel') return
    ElMessage.error(e.message || '批量删除失败')
  }
}

const goDetail = (row) => {
  router.push(`/announcements/${row.id}`)
}

onMounted(async () => {
  await loadUsersForNameMap()
  await loadList()
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar">
      <el-form :inline="true">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="标题 / 内容关键词"
            clearable
            style="width: 260px"
            @keyup.enter="loadList"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="() => { query.page = 1; loadList() }">
            查询
          </el-button>
          <el-button @click="resetQuery">重置</el-button>
          <el-button
            type="danger"
            :disabled="!isAdmin || selectedRows.length === 0"
            @click="batchDelete"
          >
            批量删除
          </el-button>
        </el-form-item>

        <el-form-item v-if="isAdmin" style="margin-left: auto; margin-right: 50px;">
          <el-button type="success" @click="openCreate">
            发布公告
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span>系统公告</span>
      </template>

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
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="goDetail(row)">
              {{ row.title }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="content-text">{{ getContentText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="createdAt"
          label="创建时间"
          width="155"
          align="center"
        >
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt || row.createTime) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="updatedAt"
          label="更新时间"
          width="155"
          align="center"
        >
          <template #default="{ row }">
            {{ formatDateTime(row.updatedAt || row.updatedTime || row.updateTime) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="author"
          label="创建人"
          width="110"
          align="center"
        >
          <template #default="{ row }">
            {{ getPublisherName(row) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button size="small" @click="goDetail(row)">详情</el-button>
            <el-button v-if="isAdmin" size="small" type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="isAdmin" size="small" type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '发布公告' : '编辑公告'"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="10"
            maxlength="5000"
            show-word-limit
            placeholder="请输入公告内容"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogLoading" @click="submit">
          保存
        </el-button>
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

.ellipsis {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.content-text {
  display: inline-block;
  max-width: 100%;
}

.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>


