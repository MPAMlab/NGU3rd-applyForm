<!-- views/KindeCallback.vue -->
<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useKindeAuth } from '../composables/useKindeAuth';

const route = useRoute();
const router = useRouter();
const { handleCallback } = useKindeAuth();

const loading = ref(true);
const error = ref(null);

onMounted(async () => {
    const code = route.query.code;
    const state = route.query.state; // Get the state parameter from Kinde redirect
    const errorParam = route.query.error;
    const errorDescription = route.query.error_description;

    if (errorParam) {
        console.error("Kinde callback error:", errorParam, errorDescription);
        error.value = `认证失败: ${errorDescription || errorParam}`;
        loading.value = false;
        setTimeout(() => {
             router.push('/'); // Redirect to home on error
        }, 3000);
        return;
    }

    if (!code || !state) {
        error.value = '认证失败: 回调参数缺失。';
        loading.value = false;
         setTimeout(() => {
             router.push('/'); // Redirect to home on missing params
        }, 3000);
        return;
    }

    try {
        // MODIFIED: handleCallback now returns context
        const result = await handleCallback(code, state);
        console.log("Kinde callback handled successfully. Redirecting...");

        if (result.success && result.context?.teamCode) {
             // If context exists and has teamCode, redirect to home with code param
             console.log(`Redirecting to /?code=${result.context.teamCode}`);
             router.push({ path: '/', query: { code: result.context.teamCode } });
        } else {
             // Otherwise, redirect to home
             console.log("Redirecting to /");
             router.push('/');
        }


    } catch (e) {
        console.error("Error handling Kinde callback:", e);
        error.value = e.message || '认证处理失败。';
        loading.value = false;
         setTimeout(() => {
             router.push('/'); // Redirect to home on error
        }, 3000);
    }
});
</script>

<template>
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div class="w-full max-w-md mx-auto text-center glass rounded-3xl p-8">
            <div v-if="loading">
                <div class="loader mb-4"></div> <!-- Add a simple CSS loader -->
                <p class="text-lg font-semibold mb-2">正在处理认证...</p>
                <p class="text-sm text-gray-400">请稍候，你将自动跳转。</p>
            </div>
            <div v-else-if="error">
                 <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-12 h-12 text-red-500 mx-auto mb-4" alt="Error">
                <p class="text-lg font-semibold text-red-500 mb-2">认证失败</p>
                <p class="text-sm text-gray-300">{{ error }}</p>
                 <button @click="router.push('/')" class="mt-6 bg-purple-700 hover:bg-purple-600 text-white py-2 px-4 rounded-lg transition">返回首页</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Basic Loader CSS */
.loader {
  border: 4px solid #f3f3f3; /* Light grey */
  border-top: 4px solid #8b5cf6; /* Purple */
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Add fade-in animation if desired */
.fade-in {
    animation: fadeIn 0.5s ease-out;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>
