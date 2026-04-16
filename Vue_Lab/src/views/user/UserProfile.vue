<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getProfileApi, updateProfileApi, changePasswordApi } from '../../api/user'
import { notifyUserProfileUpdated } from '../../utils/profileRefresh'

const router = useRouter()

const loading = ref(true)
const saveLoading = ref(false)
const pwdLoading = ref(false)

const profileForm = ref({
  userName: '',
  avatar: '',
})

const displayAccount = ref('')
const displayRole = ref('')

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const avatarPreview = ref('')
const userId = ref(null)

const defaultAvatarSeed = computed(() => profileForm.value.userName || displayAccount.value || 'User')

const dicebearUrl = computed(
  () =>
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(defaultAvatarSeed.value)}&backgroundColor=0f5ba7`,
)

const loadProfile = async () => {
  loading.value = true
  try {
    const raw = localStorage.getItem('userInfo')
    if (raw) {
      const parsed = JSON.parse(raw)
      userId.value = parsed.userId ?? parsed.id
    }

    if (!userId.value) {
      ElMessage.error('用户信息已失效，请重新登录')
      router.replace('/login')
      return
    }

    const data = await getProfileApi(userId.value)
    profileForm.value.userName = data.userName || data.name || data.userAccount || ''
    profileForm.value.avatar = data.avatar || data.avatarUrl || ''
    avatarPreview.value = profileForm.value.avatar || ''
    displayAccount.value = data.userAccount || data.userName || '-'
    displayRole.value =
      data.role || data.roleName || data.role_code || localStorage.getItem('role') || '-'
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '加载资料失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProfile()
})

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

  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = e.target.result
    avatarPreview.value = base64
    profileForm.value.avatar = base64
    ElMessage.success('图片已选择，将在保存资料时上传')
  }
  reader.readAsDataURL(file.raw)
  reader.onerror = () => {
    ElMessage.error('图片读取失败，请重试')
  }
  return false
}

const persistUserInfoPartial = (patch) => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    localStorage.setItem('userInfo', JSON.stringify({ ...parsed, ...patch }))
  } catch {
    /* ignore */
  }
}

const saveProfile = async () => {
  if (!profileForm.value.userName?.trim()) {
    ElMessage.warning('请填写昵称')
    return
  }
  saveLoading.value = true
  try {
    const avatarPayload = profileForm.value.avatar || ''
    await updateProfileApi(userId.value, {
      userName: profileForm.value.userName.trim(),
      avatar: avatarPayload,
    })
    const patch = {
      userName: profileForm.value.userName.trim(),
      avatar: avatarPayload,
    }
    persistUserInfoPartial(patch)
    notifyUserProfileUpdated(patch)
    ElMessage.success('个人信息已保存')
    // 以数据库最新值为准（后端可能规范化字段），同时刷新顶部信息
    await loadProfile()
  } catch (e) {
    const msg = e.response?.data?.message ?? e.message ?? '保存失败'
    ElMessage.error(msg)
  } finally {
    saveLoading.value = false
  }
}

const changePassword = async () => {
  const { oldPassword, newPassword, confirmPassword } = passwordForm.value
  if (!oldPassword?.trim() || !newPassword?.trim()) {
    ElMessage.warning('请填写原密码与新密码')
    return
  }
  if (newPassword !== confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  pwdLoading.value = true
  try {
    await changePasswordApi(userId.value, {
      oldPassword,
      newPassword,
    })
    ElMessage.success('密码修改成功')
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e) {
    ElMessage.error(e.message || '修改失败')
  } finally {
    pwdLoading.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="profile-page">
    <!-- 顶部视觉区 -->
    <section class="profile-hero">
      <div class="profile-hero__bg" aria-hidden="true" />
      <div class="profile-hero__content">
        <div class="profile-hero__avatar-block">
          <div class="avatar-ring">
            <el-avatar
              class="profile-hero__avatar"
              :size="100"
              :src="avatarPreview || dicebearUrl"
            >
              {{ profileForm.userName?.[0] || '用' }}
            </el-avatar>
          </div>
          <el-upload
            class="avatar-upload"
            :show-file-list="false"
            :auto-upload="false"
            accept="image/jpeg,image/png,image/gif,image/webp"
            :on-change="handleAvatarChange"
          >
            <el-button type="primary" plain round size="small">更换头像</el-button>
          </el-upload>
        </div>
        <div class="profile-hero__text">
          <h1 class="profile-hero__title">个人中心</h1>
          <p class="profile-hero__desc">维护昵称、头像与登录密码，信息将用于系统内展示</p>
          <div class="profile-hero__tags">
            <span class="tag tag--role">{{ displayRole }}</span>
            <span class="tag tag--account">账号 {{ displayAccount }}</span>
          </div>
        </div>
      </div>
    </section>

    <el-row :gutter="20" class="profile-body">
      <el-col :xs="24" :lg="14">
        <el-card class="profile-card" shadow="hover">
          <template #header>
            <div class="card-head">
              <span class="card-head__icon card-head__icon--account" aria-hidden="true" />
              <span class="card-head__title">基本资料</span>
            </div>
          </template>
          <el-form label-position="top" class="profile-form">
            <el-form-item label="昵称">
              <el-input
                v-model="profileForm.userName"
                placeholder="用于系统内显示的名称"
                maxlength="40"
                show-word-limit
                clearable
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saveLoading" @click="saveProfile">
                保存资料
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card class="profile-card profile-card--security" shadow="hover">
          <template #header>
            <div class="card-head">
              <span class="card-head__icon card-head__icon--password" aria-hidden="true" />
              <span class="card-head__title">安全设置</span>
            </div>
          </template>
          <p class="security-hint">修改密码后需使用新密码登录</p>
          <el-form label-position="top" class="profile-form">
            <el-form-item label="当前密码">
              <el-input
                v-model="passwordForm.oldPassword"
                type="password"
                show-password
                placeholder="请输入当前密码"
                autocomplete="current-password"
              />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input
                v-model="passwordForm.newPassword"
                type="password"
                show-password
                placeholder="请输入新密码"
                autocomplete="new-password"
              />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input
                v-model="passwordForm.confirmPassword"
                type="password"
                show-password
                placeholder="请再次输入新密码"
                autocomplete="new-password"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="pwdLoading" @click="changePassword">
                更新密码
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 1100px;
  margin: 0 auto;
}

.profile-hero {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: 0 8px 32px rgba(15, 91, 167, 0.18);
}

.profile-hero__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(125deg, #0f5ba7 0%, #1e88e5 45%, #42a5f5 100%);
}

.profile-hero__bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  opacity: 0.9;
}

.profile-hero__content {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 28px;
  padding: 32px 36px;
  color: #fff;
}

.profile-hero__avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.avatar-ring {
  padding: 4px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.35));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.profile-hero__avatar {
  border: 3px solid rgba(255, 255, 255, 0.95);
}

.avatar-upload :deep(.el-upload) {
  justify-content: center;
}

.profile-hero__text {
  flex: 1;
  min-width: 200px;
}

.profile-hero__title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}

.profile-hero__desc {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  opacity: 0.92;
  max-width: 420px;
}

.profile-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(8px);
}

.tag--role {
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.tag--account {
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.profile-body {
  align-items: stretch;
}

.profile-card {
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  height: 100%;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.profile-card:hover {
  transform: translateY(-2px);
}

.profile-card--security {
  background: linear-gradient(180deg, #fafcff 0%, #ffffff 100%);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-head__icon {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: linear-gradient(145deg, #1e88e5 0%, #42a5f5 55%, #64b5f6 100%);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.card-head__icon--account {
  -webkit-mask-image: url('/账号.svg');
  mask-image: url('/账号.svg');
}

.card-head__icon--password {
  -webkit-mask-image: url('/密码.svg');
  mask-image: url('/密码.svg');
}

.card-head__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.security-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.profile-form :deep(.el-form-item__label) {
  font-weight: 500;
}
</style>
