import { createRouter, createWebHistory } from 'vue-router'
// 导入我们创建的 Index.vue 组件
// 请根据你实际存放 Index.vue 的路径修改这里的路径
// 如果放在 src/views 目录下，路径可能是 '../views/Index.vue'
// 如果放在 src/components 目录下，路径可能是 '../components/Index.vue'
import IndexPage from '../views/index.vue' // 假设你放在了 src/components 下

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // 定义根路径 '/'
      path: '/',
      name: 'registration', // 给路由一个名字
      component: IndexPage // 使用 IndexPage 组件来渲染这个路径
    },
    // 如果你有其他页面，可以在这里添加更多路由
    // 例如：
    // {
    //   path: '/admin',
    //   name: 'admin',
    //   component: () => import('../views/AdminView.vue') // Lazy load other views
    // }
  ]
})

export default router