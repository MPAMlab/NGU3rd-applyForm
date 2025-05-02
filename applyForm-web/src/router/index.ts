// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from '../views/index.vue';
import AdminPage from '../views/AdminPage.vue';
import KindeCallback from '../views/KindeCallback.vue';

// MODIFIED: Import from .ts file
import { useKindeAuth } from '../composables/useKindeAuth'; // <--- MODIFIED IMPORT PATH

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'registration',
      component: IndexPage
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminPage,
      meta: { requiresAdminAuth: true }
    },
    {
      path: '/callback',
      name: 'kinde-callback',
      component: KindeCallback
    },
  ]
});

router.beforeEach(async (to, from, next) => {
    const { checkAuthStatus, isAuthenticated, kindeUser, userMember } = useKindeAuth();

    // Ensure auth status is checked on every navigation
    // The composable handles caching, so this is efficient
    // Await here to ensure state is ready before proceeding
    await checkAuthStatus();
    console.log(`Router Guard: Navigating to ${to.path}. Authenticated: ${isAuthenticated.value}, UserMember: ${!!userMember.value}`);


    // Handle the Kinde callback route - always allow access
    if (to.name === 'kinde-callback') {
        next();
        return;
    }

    // Check for routes requiring admin authentication
    if (to.meta.requiresAdminAuth) {
        // Frontend check for admin status (requires fetching user roles from Kinde)
        // For now, we rely on backend API key. If you implement Kinde roles,
        // you'd check kindeUser.value?.roles here.
        console.warn("Frontend router guard for admin route is currently bypassed, relying on backend API key.");
        next(); // Allow access, backend will enforce API key
        return;
    }

    // For the registration page ('/'), we don't strictly require auth to *view* it,
    // but the UI adapts. If the user is authenticated and already has a member record,
    // we might want to redirect them directly to the completion page or prevent them
    // from seeing the initial registration steps.
    // Let's add a redirect if authenticated AND has a member record, and they are trying to access step 1 or 2.
    // Note: This requires the checkAuthStatus() in the composable to have finished.
    if (to.path === '/' && isAuthenticated.value && userMember.value) {
         // User is logged in and registered, redirect to completion page logic within Index.vue
         // Index.vue's onMounted hook handles the redirect to step 5 if userMember exists.
         // So, we just let them go to '/' and Index.vue will handle the rest.
         next();
         return;
    }


    next(); // Allow navigation for other cases
});


export default router;
