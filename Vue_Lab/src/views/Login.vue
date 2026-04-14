<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { loginApi } from '../api/auth'

const router = useRouter()

const account = ref('')
const password = ref('')
const role = ref('')
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)

const roles = [
  { label: '系统管理员', value: '系统管理员' },
  { label: '实验室管理员', value: '实验室管理员' },
  { label: '学生', value: '学生' },
  { label: '老师', value: '老师' },
]

const handleLogin = async () => {
  error.value = ''

  if (!account.value || !password.value || !role.value) {
    error.value = '请输入账号、密码并选择角色'
    return
  }

  loading.value = true
  try {
    const userInfo = await loginApi({
      userAccount: account.value,
      password: password.value,
      role: role.value,
    })

    // userInfo: { userId, userAccount, userName, role, avatar }
    localStorage.setItem('userInfo', JSON.stringify(userInfo))
    localStorage.setItem('role', userInfo.role || role.value)
    // 如果后端未来返回 token，可在此存储；当前使用 cookie/session 登录态

    ElMessage.success('登录成功')
    router.replace('/')
  } catch (e) {
    error.value = e?.message || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const goRegister = () => {
  router.push('/register')
}
</script>

<template>
  <div class="page">
    <div class="login-card">
      <h2 class="title">欢迎登录校园实验室预约系统</h2>

      <form class="form" @submit.prevent="handleLogin">
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
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>

      <div class="footer-text">
        <span>还没有账号？</span>
        <button type="button" class="link-btn" @click="goRegister">
          注册
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
  padding: var(--spacing-lg);
  box-sizing: border-box;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: var(--spacing-xxxl) var(--spacing-xl) var(--spacing-xxl);
  background-color: #ffffff;
  border-radius: var(--border-radius-xl);
  box-shadow: var(--shadow-dark);
  box-sizing: border-box;
  transition: all 0.3s ease;
}

@media (max-width: 768px) {
  .page {
    padding: var(--spacing-md);
  }
  
  .login-card {
    padding: var(--spacing-xl) var(--spacing-lg) var(--spacing-xxl);
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .page {
    padding: var(--spacing-sm);
  }
  
  .login-card {
    padding: var(--spacing-lg) var(--spacing-md) var(--spacing-xl);
    border-radius: var(--border-radius-base);
  }
}

.title {
  margin: 0 0 var(--spacing-xl);
  text-align: center;
  font-size: var(--font-size-xxxl);
  font-weight: 600;
  color: var(--color-text-primary);
}

@media (max-width: 480px) {
  .title {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-lg);
  }
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

@media (max-width: 480px) {
  .form {
    gap: var(--spacing-md);
  }
}

.form-item {
  width: 100%;
}

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-base);
  padding: 0 var(--spacing-md);
  background-color: var(--color-bg);
  transition: border-color 0.2s, box-shadow 0.2s;
  height: 48px;
}

@media (max-width: 480px) {
  .input-wrapper {
    height: 44px;
    padding: 0 var(--spacing-sm);
  }
}

.input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

.icon {
  margin-right: var(--spacing-sm);
  font-size: 16px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .icon {
    margin-right: var(--spacing-xs);
    font-size: 14px;
  }
}

input,
select {
  flex: 1;
  height: 100%;
  border: none;
  outline: none;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  background-color: transparent;
}

@media (max-width: 480px) {
  input,
  select {
    font-size: var(--font-size-sm);
  }
}

input::placeholder,
select::placeholder {
  color: var(--color-text-placeholder);
}

.toggle-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  border-radius: var(--border-radius-base);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-btn:hover {
  color: var(--color-primary);
  background-color: var(--color-bg-page);
}

@media (max-width: 480px) {
  .toggle-btn {
    padding: 4px var(--spacing-xs);
    font-size: var(--font-size-xs);
  }
}

.error-text {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  text-align: center;
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-sm);
  background-color: rgba(245, 108, 108, 0.1);
  border-radius: var(--border-radius-base);
  border: 1px solid rgba(245, 108, 108, 0.2);
}

.primary-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: var(--border-radius-base);
  background-color: var(--color-primary);
  color: white;
  font-size: var(--font-size-base);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: var(--spacing-md);
}

@media (max-width: 480px) {
  .primary-btn {
    height: 44px;
    font-size: var(--font-size-sm);
  }
}

.primary-btn:hover:not(:disabled) {
  background-color: #66b1ff;
  transform: translateY(-1px);
  box-shadow: var(--shadow-base);
}

.primary-btn:disabled {
  background-color: var(--color-text-placeholder);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.footer-text {
  text-align: center;
  margin-top: var(--spacing-xl);
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
}

@media (max-width: 480px) {
  .footer-text {
    margin-top: var(--spacing-lg);
    font-size: var(--font-size-xs);
  }
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: inherit;
  text-decoration: underline;
  margin-left: var(--spacing-xs);
  transition: color 0.2s ease;
}

.link-btn:hover {
  color: #66b1ff;
}

input::placeholder {
  color: var(--color-text-placeholder);
}

select {
  color: #606266;
}

select:invalid {
  color: #c0c4cc;
}
</style>
