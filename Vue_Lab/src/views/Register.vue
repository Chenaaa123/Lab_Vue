<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { registerApi } from '../api/auth'

const router = useRouter()

const account = ref('')
const password = ref('')
const confirmPassword = ref('')
const role = ref('学生')
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)

/** 公开注册可选角色（系统管理员须由后台或既有管理员创建，不可自助注册） */
const roles = [
  { label: '学生', value: '学生' },
  { label: '老师', value: '老师' },
  { label: '实验室管理员', value: '实验室管理员' },
]

const handleRegister = async () => {
  error.value = ''

  if (!account.value || !password.value || !confirmPassword.value || !role.value) {
    error.value = '请完整填写所有信息并选择角色'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  if (role.value === '系统管理员') {
    error.value = '不能选择系统管理员身份注册，该角色由系统分配'
    return
  }

  loading.value = true
  try {
    await registerApi({
      userAccount: account.value,
      password: password.value,
      role: role.value,
    })

    ElMessage.success('注册成功，请使用新账号登录')
    router.push('/login')
  } catch (e) {
    error.value = e?.message || '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const goLogin = () => {
  router.push('/login')
}
</script>

<template>
  <div class="page">
    <div class="login-card">
      <h2 class="title">注册校园实验室预约系统账号</h2>

      <form class="form" @submit.prevent="handleRegister">
        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon">👤</span>
            <input
              v-model="account"
              type="text"
              placeholder="请输入账号"
            >
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon">🔒</span>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
            >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <span class="icon">🔒</span>
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="请再次输入密码"
            >
            <button
              type="button"
              class="toggle-btn"
              :aria-label="showConfirmPassword ? '隐藏密码' : '显示密码'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              {{ showConfirmPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div class="form-item">
          <div class="input-wrapper">
            <select v-model="role">
              <option value="" disabled>请选择角色</option>
              <option
                v-for="item in roles"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>

        <button
          class="primary-btn"
          type="submit"
          :disabled="loading"
        >
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </form>

      <div class="footer-text">
        <span>已经有账号？</span>
        <button type="button" class="link-btn" @click="goLogin">
          去登录
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e88e5 0%, #42a5f5 40%, #e3f2fd 100%);
}

.login-card {
  width: 420px;
  padding: 32px 40px 40px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}

.title {
  margin: 0 0 24px;
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  color: #333;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  width: 100%;
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
  background-color: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-wrapper:focus-within {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

.icon {
  margin-right: 8px;
  font-size: 16px;
  color: #909399;
}

input,
select {
  flex: 1;
  height: 40px;
  border: none;
  outline: none;
  font-size: 14px;
  color: #333;
  background-color: transparent;
}

input::placeholder {
  color: #c0c4cc;
}

select {
  color: #606266;
}

select:invalid {
  color: #c0c4cc;
}

.toggle-btn {
  border: none;
  background: none;
  padding: 0 2px;
  height: 40px;
  cursor: pointer;
  color: #1e88e5;
  font-size: 13px;
}

.toggle-btn:hover {
  text-decoration: underline;
}

.error-text {
  margin: 0;
  font-size: 13px;
  color: #f56c6c;
}

.primary-btn {
  width: 100%;
  height: 40px;
  margin-top: 4px;
  border: none;
  border-radius: 4px;
  background-color: #1e88e5;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.primary-btn:hover {
  background-color: #1565c0;
  box-shadow: 0 4px 10px rgba(21, 101, 192, 0.4);
}

.primary-btn:disabled {
  cursor: not-allowed;
  background-color: #90caf9;
  box-shadow: none;
}

.footer-text {
  margin-top: 16px;
  text-align: right;
  font-size: 13px;
  color: #666;
}

.link-btn {
  border: none;
  padding: 0;
  margin-left: 4px;
  background: none;
  color: #1e88e5;
  cursor: pointer;
  font-size: 13px;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>


