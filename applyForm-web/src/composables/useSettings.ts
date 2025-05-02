// composables/useSettings.ts
import { ref, readonly, Ref } from 'vue';
import { useKindeAuth } from './useKindeAuth'; // Import useKindeAuth

const isCollectionPaused: Ref<boolean> = ref(false);
const isFetchingSettings: Ref<boolean> = ref(false);
const isTogglingCollection: Ref<boolean> = ref(false);
const settingsError: Ref<string | null> = ref(null);

const { authenticatedFetch, isAdminUser } = useKindeAuth(); // Use authenticatedFetch and isAdminUser

async function fetchCollectionStatus(): Promise<void> {
    isFetchingSettings.value = true;
    settingsError.value = null;
    try {
        // This is a public endpoint, no auth needed
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/settings`);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error('API error fetching settings:', response.status, data);
            throw new Error(data.error || `获取设置失败 (${response.status})`);
        }

        const data = await response.json();
        isCollectionPaused.value = data.collection_paused === true; // Ensure boolean
        console.log('Fetched collection status:', isCollectionPaused.value);

    } catch (e: any) {
        console.error('Fetch error fetching settings:', e);
        settingsError.value = e.message || '无法获取设置信息。';
        // Default to not paused on error for safety in signup flow
        isCollectionPaused.value = false;
    } finally {
        isFetchingSettings.value = false;
    }
}

async function toggleCollectionStatus(): Promise<void> {
    if (!isAdminUser.value) {
        settingsError.value = '没有权限执行此操作。';
        console.warn('Attempted to toggle collection status without admin privileges.');
        return;
    }

    isTogglingCollection.value = true;
    settingsError.value = null;

    try {
        // This is an admin endpoint, requires Kinde auth + isAdmin check (handled by backend middleware)
        const response = await authenticatedFetch(`${import.meta.env.VITE_API_BASE_URL}/admin/settings/toggle-collection`, {
            method: 'POST',
            headers: {
                 'Content-Type': 'application/json', // Even if body is empty, good practice
            },
            // No body needed for a simple toggle
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('API error toggling collection status:', response.status, data);
            throw new Error(data.error || `切换收集状态失败 (${response.status})`);
        }

        isCollectionPaused.value = data.collection_paused === true; // Update state from response
        console.log('Collection status toggled successfully:', isCollectionPaused.value);
        settingsError.value = `收集状态已切换为：${isCollectionPaused.value ? '暂停' : '活跃'}`; // Success message
        setTimeout(() => { settingsError.value = null; }, 3000); // Clear message

    } catch (e: any) {
        console.error('Fetch error toggling collection status:', e);
        settingsError.value = e.message || '切换收集状态失败。';
         // If auth failed, useKindeAuth's authenticatedFetch will handle it
    } finally {
        isTogglingCollection.value = false;
    }
}


export function useSettings() {
    // Fetch status on initial use (or component mount)
    // This might be called multiple times if used in different components,
    // but the state is shared, so it's generally fine.
    // A better approach might be to call this once in the App.vue or a router guard.
    // For now, calling it here is simple.
    fetchCollectionStatus();

    return {
        isCollectionPaused: readonly(isCollectionPaused),
        isFetchingSettings: readonly(isFetchingSettings),
        isTogglingCollection: readonly(isTogglingCollection),
        settingsError: readonly(settingsError),
        fetchCollectionStatus, // Expose fetch if needed manually
        toggleCollectionStatus, // Expose toggle for admin page
    };
}
