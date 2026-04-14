<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { logoutApi } from '../api/auth'
import { getProfileApi } from '../api/user'

const router = useRouter()
const route = useRoute()

const userProfile = ref(null)

const username = computed(() => {
  // 优先使用从数据库获取的用户名
  if (userProfile.value?.userName) {
    return userProfile.value.userName
  }
  if (userProfile.value?.userAccount) {
    return userProfile.value.userAccount
  }
  if (userProfile.value?.name) {
    return userProfile.value.name
  }
  // 其次使用localStorage中的用户名
  const raw = localStorage.getItem('userInfo')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return parsed.userName || parsed.userAccount || '用户'
    } catch {
      return localStorage.getItem('username') || '用户'
    }
  }
  return localStorage.getItem('username') || '用户'
})

const userAvatar = computed(() => {
  // 优先使用从数据库获取的头像
  if (userProfile.value?.avatar) {
    return userProfile.value.avatar
  }
  if (userProfile.value?.avatarUrl) {
    return userProfile.value.avatarUrl
  }
  // 其次使用localStorage中的头像
  const raw = localStorage.getItem('userInfo')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return parsed.avatar || parsed.avatarUrl || ''
    } catch {
      return ''
    }
  }
  return ''
})

const defaultAvatar = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const name = parsed.userName || parsed.userAccount || '用户'
      return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=0f5ba7`
    } catch {
      return `https://api.dicebear.com/7.x/initials/svg?seed=User&backgroundColor=0f5ba7`
    }
  }
  return `https://api.dicebear.com/7.x/initials/svg?seed=User&backgroundColor=0f5ba7`
})

const role = computed(() => {
  // 优先使用从数据库获取的角色
  if (userProfile.value?.role) {
    return userProfile.value.role
  }
  if (userProfile.value?.roleName) {
    return userProfile.value.roleName
  }
  if (userProfile.value?.role_code) {
    return userProfile.value.role_code
  }
  // 其次使用localStorage中的角色
  return localStorage.getItem('role') || ''
})

const isAdmin = computed(() => role.value === '系统管理员')

const isLabManager = computed(() => role.value === '实验室管理员')

const isStudentOrTeacher = computed(() => {
  return role.value === '老师' || role.value === '学生'
})

/** 实验室管理员 / 学生 / 老师：侧栏展示「个人中心」一级菜单（与系统首页、信息管理同级） */
const showPersonalCenterMenu = computed(
  () => isLabManager.value || isStudentOrTeacher.value,
)

const handleSelect = (index) => {
  if (index.startsWith('http')) return
  router.push(index)
}

const logout = async () => {
  try {
    await logoutApi()
  } catch (e) {
    // ignore
  } finally {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    localStorage.removeItem('userInfo')
    ElMessage.success('已退出登录')
    router.replace('/login')
  }
}

const loadUserProfile = async () => {
  try {
    const raw = localStorage.getItem('userInfo')
    if (raw) {
      const parsed = JSON.parse(raw)
      const userId = parsed.userId || parsed.id
      if (userId) {
        const data = await getProfileApi(userId)
        if (data) {
          userProfile.value = data
          // 更新localStorage中的完整用户信息
          localStorage.setItem('userInfo', JSON.stringify({
            ...parsed,
            userName: data.userName || data.name || parsed.userName,
            userAccount: data.userAccount || parsed.userAccount,
            avatar: data.avatar || data.avatarUrl,
            role: data.role || data.roleName || data.role_code || parsed.role,
          }))
          // 如果角色有变化，也更新localStorage中的role
          if (data.role || data.roleName || data.role_code) {
            localStorage.setItem('role', data.role || data.roleName || data.role_code || parsed.role)
          }
        }
      }
    }
  } catch (e) {
    console.error('获取用户信息失败:', e)
  }
}

onMounted(() => {
  loadUserProfile()
})
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo-box">
        <div class="logo-icon">🧪</div>
        <div class="logo-text">校园实验室预约系统</div>
      </div>

      <el-menu
        :default-active="route.path"
        :default-openeds="['info', 'user']"
        class="menu"
        background-color="#0f5ba7"
        text-color="#ffffff"
        active-text-color="#ffffff"
        @select="handleSelect"
      >
        <el-menu-item index="/">
          <span class="menu-icon">🏠</span>
          <template #title>系统首页</template>
        </el-menu-item>

        <el-menu-item v-if="showPersonalCenterMenu" index="/profile">
          <span class="menu-icon">👤</span>
          <template #title>个人中心</template>
        </el-menu-item>

        <el-sub-menu index="info">
          <template #title>
            <span class="menu-icon">📋</span>
            <span>信息管理</span>
          </template>
          <!-- 公告信息 / 实验室分类 仅系统管理员可见 -->
          <el-menu-item v-if="isAdmin" index="/announcements">公告信息</el-menu-item>
          <el-menu-item v-if="isAdmin" index="/lab-categories">实验室分类</el-menu-item>
          <el-menu-item :index="isAdmin || isLabManager ? '/labs/manage' : '/labs/browse'">实验室信息</el-menu-item>
          <el-menu-item index="/reservations">预约记录</el-menu-item>
          <!-- 学生/老师：报修记录、检修记录 -->
          <el-menu-item v-if="isStudentOrTeacher" index="/repairs/my">报修记录</el-menu-item>
          <el-menu-item v-if="isStudentOrTeacher" index="/inspections/my">检修记录</el-menu-item>
          <!-- 管理员/实验室管理员：报修记录、检修记录（所有实验室） -->
          <el-menu-item v-if="!isStudentOrTeacher" index="/repairs/all">报修记录</el-menu-item>
          <el-menu-item v-if="!isStudentOrTeacher" index="/inspections">检修记录</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="isAdmin" index="user">
          <template #title>
            <span class="menu-icon">👥</span>
            <span>用户管理</span>
          </template>
          <el-menu-item index="/users">系统管理员</el-menu-item>
          <el-menu-item index="/users/lab-managers">实验室管理员</el-menu-item>
          <el-menu-item index="/users/teachers-students">师生信息</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="breadcrumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }" class="breadcrumb-home">
              <span class="breadcrumb-icon">🏠</span>
              首页
            </el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title" class="breadcrumb-current">
              {{ route.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <div class="user-info">
            <el-avatar
              size="small"
              :src="userAvatar || defaultAvatar"
              class="user-avatar"
            >
              {{ username.charAt(0) }}
            </el-avatar>
            <div class="user-meta">
              <span class="user-name">{{ username }}</span>
              <span v-if="role" class="user-role">{{ role }}</span>
            </div>
            <el-button link size="small" type="danger" @click="logout" class="logout-btn">
              退出
            </el-button>
          </div>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}

.aside {
  background-color: #0f5ba7;
  color: #fff;
  display: flex;
  flex-direction: column;
}

.logo-box {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 10px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
}

.menu {
  border-right: none;
}

.menu :deep(.el-menu-item.is-active) {
  background-color: rgba(255, 255, 255, 0.15) !important;
}

.menu-icon {
  margin-right: 8px;
  font-size: 18px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #ffffff;
  box-shadow: var(--shadow-light);
  padding: 0 var(--spacing-xl);
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border-lighter);
}

/* 面包屑导航样式 */
.breadcrumb {
  display: flex;
  align-items: center;
}

.breadcrumb :deep(.el-breadcrumb__item) {
  font-size: var(--font-size-base);
}

.breadcrumb :deep(.el-breadcrumb__item .el-breadcrumb__inner) {
  color: var(--color-text-regular);
  font-weight: 400;
  transition: color 0.2s ease;
}

.breadcrumb :deep(.el-breadcrumb__item .el-breadcrumb__inner:hover) {
  color: var(--color-primary);
}

.breadcrumb-home :deep(.el-breadcrumb__inner) {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-weight: 500;
  color: var(--color-text-primary);
}

.breadcrumb-icon {
  font-size: 16px;
}

.breadcrumb-current :deep(.el-breadcrumb__inner) {
  color: var(--color-text-primary);
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius-lg);
  background-color: var(--color-bg-page);
  transition: all 0.2s ease;
}

.user-info:hover {
  background-color: var(--color-border-lighter);
}

.user-avatar {
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-size: var(--font-size-base);
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.user-role {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1;
}

.logout-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
  border-radius: var(--border-radius-base);
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background-color: rgba(245, 108, 108, 0.1);
}

.user-meta {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 14px;
}

.user-role {
  font-size: 12px;
  color: #909399;
}

.main {
  background-color: #f5f7fa;
  padding: 16px 24px;
}
</style>


