// router/index.js
import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from '../views/index.vue';
import AdminPage from '../views/AdminPage.vue';
// ADDED: Import the Kinde Callback component
import KindeCallback from '../views/KindeCallback.vue'; // <--- ADD THIS LINE

// ADDED: Import the Kinde auth composable
import { useKindeAuth } from '../composables/useKindeAuth'; // <--- ADD THIS LINE

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
      // ADDED: Meta field to indicate this route requires admin authentication
      meta: { requiresAdminAuth: true } // <--- ADD THIS LINE
    },
    // ADDED: Kinde Callback Route
    {
      path: '/callback', // This path must match your Kinde Allowed callback URLs
      name: 'kinde-callback',
      component: KindeCallback // Use the new callback component
    },
    // Optional: Add a route for logout redirect if needed, though Kinde redirects directly
    // {
    //   path: '/logout',
    //   name: 'logout',
    //   redirect: '/' // Just redirect to home after Kinde logout
    // }
  ]
});

// ADDED: Global Navigation Guard
router.beforeEach(async (to, from, next) => {
    const { checkAuthStatus, isAuthenticated, kindeUser, userMember } = useKindeAuth();

    // Ensure auth status is checked on every navigation
    // The composable handles caching, so this is efficient
    await checkAuthStatus();

    // Handle the Kinde callback route - always allow access
    if (to.name === 'kinde-callback') {
        next();
        return;
    }

    // Check for routes requiring admin authentication
    if (to.meta.requiresAdminAuth) {
        // Admin auth is handled by API key in the backend, not Kinde token for now.
        // You might add a check here if you implement admin login via Kinde later.
        // For now, we rely solely on the backend API key check.
        // However, you might want to prevent non-admins from *seeing* the page.
        // This would require fetching user roles/permissions from Kinde after login.
        // For simplicity now, we'll let the backend handle admin auth entirely.
        // If you want a frontend check, you'd need to store admin status in the composable.
        console.warn("Frontend router guard for admin route is currently bypassed, relying on backend API key.");
        next(); // Allow access, backend will enforce API key
        return;
    }

    // For other routes (like '/', which is the registration page)
    // We don't strictly *require* authentication to view the page,
    // but certain actions (like joining/editing) will require it.
    // The UI in Index.vue will adapt based on isAuthenticated and userMember.

    next(); // Allow navigation
});


export default router;
