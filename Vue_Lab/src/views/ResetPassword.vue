<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, Hide } from '@element-plus/icons-vue'
import { resetPasswordByOldPasswordApi } from '../api/auth'
import ParticleLinkBackground from '../components/ParticleLinkBackground.vue'

const router = useRouter()

const form = ref({
  userAccount: '',
  oldPassword: '',
  newPassword: '',
  confirmNewPassword: '',
})

const loading = ref(false)
const error = ref('')
const showOldPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const handleResetPassword = async () => {
  error.value = ''
  const payload = {
    userAccount: form.value.userAccount.trim(),
    oldPassword: form.value.oldPassword,
    newPassword: form.value.newPassword,
    confirmNewPassword: form.value.confirmNewPassword,
  }

  if (!payload.userAccount || !payload.oldPassword || !payload.newPassword || !payload.confirmNewPassword) {
    error.value = '请完整填写账号、原密码、新密码和确认新密码'
    return
  }
  if (payload.newPassword.length < 6) {
    error.value = '新密码至少 6 位'
    return
  }
  if (payload.newPassword !== payload.confirmNewPassword) {
    error.value = '新密码与确认新密码不一致'
    return
  }
  if (payload.newPassword === payload.oldPassword) {
    error.value = '新密码不能与原密码相同'
    return
  }

  loading.value = true
  try {
    await resetPasswordByOldPasswordApi(payload)
    ElMessage.success('密码重置成功，请使用新密码登录')
    router.push({
      path: '/login',
      query: { account: payload.userAccount },
    })
  } catch (e) {
    error.value = e?.message || '重置失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const goLogin = () => router.push('/login')
const goRegister = () => router.push('/register')
</script>

<template>
  <div class="page">
    <ParticleLinkBackground />
    <div class="reset-card">
      <h2 class="title">忘记密码</h2>
      <p class="subtitle">输入账号、原密码和新密码即可完成重置</p>

      <form class="form" @submit.prevent="handleResetPassword">
        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon icon--account" aria-hidden="true" />
            <input
              v-model="form.userAccount"
              type="text"
              placeholder="请输入账号"
            >
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon icon--password" aria-hidden="true" />
            <input
              v-model="form.oldPassword"
              :type="showOldPassword ? 'text' : 'password'"
              placeholder="请输入原密码"
            >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="showOldPassword ? '隐藏密码' : '显示密码'"
              @click="showOldPassword = !showOldPassword"
            >
              <el-icon :size="18">
                <View v-if="!showOldPassword" />
                <Hide v-else />
              </el-icon>
            </button>
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon icon--password" aria-hidden="true" />
            <input
              v-model="form.newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              placeholder="请输入新密码（至少 6 位）"
            >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="showNewPassword ? '隐藏密码' : '显示密码'"
              @click="showNewPassword = !showNewPassword"
            >
              <el-icon :size="18">
                <View v-if="!showNewPassword" />
                <Hide v-else />
              </el-icon>
            </button>
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon icon--password" aria-hidden="true" />
            <input
              v-model="form.confirmNewPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="请再次输入新密码"
            >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <el-icon :size="18">
                <View v-if="!showConfirmPassword" />
                <Hide v-else />
              </el-icon>
            </button>
          </div>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>

        <button class="primary-btn" type="submit" :disabled="loading">
          {{ loading ? '重置中...' : '重置密码' }}
        </button>
      </form>

      <div class="footer-actions">
        <button type="button" class="link-btn" @click="goLogin">返回登录</button>
        <span class="dot">·</span>
        <button type="button" class="link-btn" @click="goRegister">去注册</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(135deg, #1e88e5 0%, #42a5f5 40%, #e3f2fd 100%);
  padding: 24px;
  box-sizing: border-box;
}

.reset-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  padding: 32px 36px 30px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}

.title {
  margin: 0 0 8px;
  text-align: center;
  font-size: 26px;
  font-weight: 600;
  color: #2a2f3a;
}

.subtitle {
  margin: 0 0 20px;
  text-align: center;
  color: #7a8599;
  font-size: 13px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 0 12px;
  background-color: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-wrapper:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

.icon {
  display: inline-block;
  vertical-align: middle;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  flex-shrink: 0;
  background: linear-gradient(145deg, #1e88e5 0%, #42a5f5 55%, #64b5f6 100%);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}

.icon--account {
  -webkit-mask-image: url('/账号.svg');
  mask-image: url('/账号.svg');
}

.icon--password {
  -webkit-mask-image: url('/密码.svg');
  mask-image: url('/密码.svg');
}

input {
  flex: 1;
  height: 44px;
  border: none;
  outline: none;
  font-size: 14px;
  color: #333;
  background-color: transparent;
}

input::placeholder {
  color: #c0c4cc;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 34px;
  padding: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: #909399;
  border-radius: 4px;
  transition: color 0.2s ease, background-color 0.2s ease;
  flex-shrink: 0;
}

.toggle-btn:hover {
  color: #1e88e5;
  background-color: rgba(30, 136, 229, 0.08);
}

.toggle-btn :deep(.el-icon) {
  margin: 0;
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: #f56c6c;
}

.primary-btn {
  width: 100%;
  height: 42px;
  margin-top: 4px;
  border: none;
  border-radius: 8px;
  background-color: #1e88e5;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.primary-btn:hover:not(:disabled) {
  background-color: #1565c0;
  box-shadow: 0 4px 10px rgba(21, 101, 192, 0.35);
}

.primary-btn:disabled {
  cursor: not-allowed;
  background-color: #90caf9;
  box-shadow: none;
}

.footer-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8a94a8;
  font-size: 13px;
}

.dot {
  margin: 0 8px;
}

.link-btn {
  border: none;
  padding: 0;
  background: none;
  color: #1e88e5;
  cursor: pointer;
  font-size: 13px;
}

.link-btn:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .page {
    padding: 14px;
  }

  .reset-card {
    padding: 24px 18px 20px;
  }

  .title {
    font-size: 22px;
  }
}
</style>
