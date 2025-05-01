import { createRouter, createWebHistory } from 'vue-router'
// 导入我们创建的 Index.vue 组件
// 请根据你实际存放 Index.vue 的路径修改这里的路径
import IndexPage from '../views/index.vue' // 假设你放在了 src/views 下

// ADDED: Import the new AdminPage component (assuming it's in src/views)
// If you put it elsewhere, adjust the path accordingly
import AdminPage from '../views/AdminPage.vue' // <--- ADD THIS LINE

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // 定义根路径 '/'
      path: '/',
      name: 'registration', // 给路由一个名字
      component: IndexPage // 使用 IndexPage 组件来渲染这个路径
    },
    // ADDED: Admin Route
    {
      path: '/admin', // The URL path for the admin page
      name: 'admin',
      component: AdminPage // Use the new AdminPage component
      // Optional: Add meta fields if needed, e.g., requiresAuth: true
    }
  ]
})

export default router
