import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '../views/ChatView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import { useUser } from '../composables/useUser'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatView,
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView
    }
  ],
})

router.beforeEach(async (to, _from, next) => {
  const { isLoggedIn, restoreSession } = useUser()
  
  // Try to restore session if not logged in but has token
  if (!isLoggedIn.value && localStorage.getItem('user_id')) {
    await restoreSession()
  }

  if (to.meta.requiresAuth && !isLoggedIn.value) {
    next('/login')
  } else {
    next()
  }
})

export default router
