import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import ResetPassword from '../views/ResetPassword.vue'
import MainLayout from '../layouts/MainLayout.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { public: true },
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: ResetPassword,
    meta: { public: true },
  },
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/dashboard/DashboardHome.vue'),
        meta: { title: '系统首页' },
      },
      {
        path: 'labs/browse',
        name: 'LabBrowse',
        component: () => import('../views/lab/LabBrowse.vue'),
        meta: { title: '预约记录' },
      },
      {
        path: 'lab-categories',
        name: 'LabCategoryManage',
        component: () => import('../views/labCategory/LabCategoryManage.vue'),
        meta: { title: '实验室分类' },
      },
      {
        path: 'labs/manage',
        name: 'LabManage',
        component: () => import('../views/lab/LabManage.vue'),
        meta: { title: '实验室信息' },
      },
      {
        path: 'reservations',
        name: 'Reservations',
        component: () => import('../views/reservation/Reservations.vue'),
        meta: { title: '预约记录' },
      },
      {
        path: 'repairs/my',
        name: 'MyRepairs',
        component: () => import('../views/repair/MyRepairs.vue'),
        meta: { title: '报修记录' },
      },
      {
        path: 'repairs/all',
        name: 'RepairRecords',
        component: () => import('../views/repair/RepairRecords.vue'),
        meta: { title: '报修记录' },
      },
      {
        path: 'inspections',
        name: 'InspectionRecords',
        component: () => import('../views/inspection/InspectionRecords.vue'),
        meta: { title: '检修记录' },
      },
      {
        path: 'inspections/my',
        name: 'MyInspections',
        component: () => import('../views/inspection/InspectionRecords.vue'),
        meta: { title: '检修记录', isMyRecords: true },
      },
      {
        path: 'announcements',
        name: 'AnnouncementList',
        component: () => import('../views/announcement/AnnouncementList.vue'),
        meta: { title: '公告列表' },
      },
      {
        path: 'announcements/:id',
        name: 'AnnouncementDetail',
        component: () => import('../views/announcement/AnnouncementDetail.vue'),
        meta: { title: '公告详情' },
      },
      {
        path: 'users',
        name: 'UserManage',
        component: () => import('../views/user/UserManage.vue'),
        meta: { title: '系统管理员' },
      },
      {
        path: 'users/lab-managers',
        name: 'LabManagerList',
        component: () => import('../views/user/UserManage.vue'),
        meta: { title: '实验室管理员' },
      },
      {
        path: 'users/teachers-students',
        name: 'TeacherStudentList',
        component: () => import('../views/user/UserManage.vue'),
        meta: { title: '师生信息' },
      },
      {
        path: 'users/students',
        redirect: '/users/teachers-students',
      },
      {
        path: 'profile',
        name: 'UserProfile',
        component: () => import('../views/user/UserProfile.vue'),
        meta: { title: '个人中心' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  if (to.meta.public) {
    next()
    return
  }

  const userInfo = localStorage.getItem('userInfo')

  if (!userInfo && to.path !== '/login') {
    next('/login')
    return
  }

  let role = ''
  if (userInfo) {
    try {
      const parsed = JSON.parse(userInfo)
      role = parsed.role || ''
    } catch {
      role = localStorage.getItem('role') || ''
    }
  }

  if ((role === '老师' || role === '学生') && to.path.startsWith('/announcements')) {
    next('/')
    return
  }

  next()
})

export default router


