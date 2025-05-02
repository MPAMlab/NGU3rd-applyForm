<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useKindeAuth } from '../composables/useKindeAuth'; // Import useKindeAuth
import { useSettings } from '../composables/useSettings'; // Import useSettings
import { useRouter } from 'vue-router'; // Import router for potential redirect

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
// R2_PUBLIC_URL_BASE is now fetched from backend /members/me or should be in env
// For display purposes, let's assume it's available via env or a global config
const R2_PUBLIC_URL_BASE = import.meta.env.VITE_R2_PUBLIC_URL_BASE || 'https://ngu3-signup-bucket.srt.pub'; // Still need this for avatar display
const MAX_AVATAR_SIZE_MB = 2; // Match backend limit

// --- Composable Usage ---
const { isAuthenticated, userMember, isAdminUser, login, logout, checkAuthStatus, authenticatedFetch } = useKindeAuth();
const { isCollectionPaused, isFetchingSettings, isTogglingCollection, settingsError, toggleCollectionStatus } = useSettings();

const router = useRouter();

// --- State Management (Reactive) ---
const state = reactive({
    members: [], // List of all members
    isLoading: false, // Global loading for main table/actions
    errorMessage: null, // Global error message

    // Modal State for Add/Edit
    showModal: false,
    isEditing: false, // True for edit, false for add
    currentMember: null, // Member object being edited, or null for add
    modalErrorMessage: null,

    // Form fields in the modal
    modalForm: {
        id: null, // Only for editing
        teamCode: null,
        color: null,
        job: null,
        maimaiId: null,
        nickname: null,
        qqNumber: null,
        kindeUserId: null, // ADDED: Admin can see/edit Kinde ID
        avatarFile: null, // File object for new upload
        avatarPreviewUrl: null, // URL for preview
        clearAvatarFlag: false, // Flag to indicate avatar should be removed
    },
});

// --- Computed Properties ---
// Helper to get color text
function getColorText(colorId) {
     const map = { red: '火', green: '木', blue: '水' };
     return map[colorId] || '未知';
}
// Helper to get job text
function getJobText(jobType) {
    const map = { attacker: '绝剑士', defender: '矩盾手', supporter: '炼星师' };
    return map[jobType] || '未知';
}
// Helper to get icon path (reused from main page)
function getIconPath(type, value) {
    const paths = {
        color: {
            red: '/fire.svg',
            green: '/wood.svg',
            blue: '/water.svg'
        },
        job: {
            attacker: '/attacker.svg',
            defender: '/defender.svg',
            supporter: '/supporter.svg'
        }
    };
    return paths[type]?.[value] || '';
}

// Check if a color is available in the current team (for modal)
const isColorAvailableInTeam = computed(() => (color) => {
    if (!state.modalForm.teamCode) return true; // Assume available if no team selected yet
    const membersInCurrentTeam = state.members.filter(m => m.team_code === state.modalForm.teamCode);

    // If editing, the current member's color doesn't count as "taken" by others
    if (state.isEditing && state.currentMember) {
        const memberBeingEdited = membersInCurrentTeam.find(m => m.id === state.currentMember.id);
        if (memberBeingEdited && memberBeingEdited.color === color) return true; // This is the member's current color
    }

    // Check if any *other* member in this team has this color
    return !membersInCurrentTeam.some(m => m.color === color && (!state.isEditing || m.id !== state.currentMember.id));
});

// Check if a job is available in the current team (for modal)
const isJobAvailableInTeam = computed(() => (job) => {
    if (!state.modalForm.teamCode) return true; // Assume available if no team selected yet
    const membersInCurrentTeam = state.members.filter(m => m.team_code === state.modalForm.teamCode);

     // If editing, the current member's job doesn't count as "taken" by others
    if (state.isEditing && state.currentMember) {
        const memberBeingEdited = membersInCurrentTeam.find(m => m.id === state.currentMember.id);
        if (memberBeingEdited && memberBeingEdited.job === job) return true; // This is the member's current job
    }

    // Check if any *other* member in this team has this job
    return !membersInCurrentTeam.some(m => m.job === job && (!state.isEditing || m.id !== state.currentMember.id));
});


// --- Methods / Functions ---

// Removed authenticate function - now handled by Kinde auth check

// Fetch all members (API: GET /api/admin/members)
async function fetchMembers() {
    // Check if user is authenticated and is admin before fetching
    if (!isAuthenticated.value || !isAdminUser.value) {
        console.warn("Attempted to fetch members without admin privileges.");
        state.errorMessage = '没有权限获取数据。'; // This should ideally not be reached if template is correct
        return;
    }

    state.isLoading = true;
    state.errorMessage = null;

    try {
        // Use authenticatedFetch - backend checks Kinde cookie and isAdmin status
        const response = await authenticatedFetch(`${API_BASE_URL}/admin/members`, {
            method: 'GET',
            headers: {
                // 'X-Admin-API-Key': adminApiKey.value.trim(), // REMOVED API KEY
                'Content-Type': 'application/json',
            },
            // mode: 'cors', // authenticatedFetch handles mode and credentials
        });

        // authenticatedFetch handles 401. We need to handle 403 specifically for admin authz.
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             console.error('Admin API error (403 Forbidden):', data);
             state.errorMessage = data.error || '没有权限执行此操作。';
             // No need to set isAuthenticated = false here, authenticatedFetch does 401
             return; // Stop processing on 403
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('API error fetching members:', response.status, data);
            throw new Error(data.error || `获取成员列表失败 (${response.status})`);
        }

        state.members = data.members || []; // Assuming backend returns { members: [...] }

    } catch (e) {
        console.error('Fetch error fetching members:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
         // authenticatedFetch handles 401 and sets isAuthenticated = false
    } finally {
        state.isLoading = false;
    }
}

// Open Add Member Modal
function openAddModal() {
    if (!isAdminUser.value) {
         state.errorMessage = '没有权限执行此操作。';
         return;
    }
    state.isEditing = false;
    state.currentMember = null;
    // Reset modal form fields
    state.modalForm = {
        id: null,
        teamCode: null,
        color: null,
        job: null,
        maimaiId: null,
        nickname: null,
        qqNumber: null,
        kindeUserId: null, // Reset Kinde ID field
        avatarFile: null,
        avatarPreviewUrl: null,
        clearAvatarFlag: false,
    };
    state.modalErrorMessage = null;
    state.showModal = true;
}

// Open Edit Member Modal
function openEditModal(member) {
     if (!isAdminUser.value) {
         state.errorMessage = '没有权限执行此操作。';
         return;
    }
    state.isEditing = true;
    state.currentMember = member;
    // Populate modal form fields from the member data
    state.modalForm = {
        id: member.id,
        teamCode: member.team_code,
        color: member.color,
        job: member.job,
        maimaiId: member.maimai_id,
        nickname: member.nickname,
        qqNumber: member.qq_number,
        kindeUserId: member.kinde_user_id, // Populate Kinde ID field
        avatarFile: null, // No file selected initially for edit
        avatarPreviewUrl: member.avatar_url, // Show current avatar
        clearAvatarFlag: false, // Not checked initially
    };
    state.modalErrorMessage = null;
    state.showModal = true;
}

// Close Modal
function closeModal() {
    state.showModal = false;
    state.modalErrorMessage = null;
    // Clean up avatar preview URL if it exists
    if (state.modalForm.avatarPreviewUrl && state.modalForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.modalForm.avatarPreviewUrl);
    }
    // Reset form state
    state.modalForm = {
        id: null,
        teamCode: null,
        color: null,
        job: null,
        maimaiId: null,
        nickname: null,
        qqNumber: null,
        kindeUserId: null, // Reset Kinde ID field
        avatarFile: null,
        avatarPreviewUrl: null,
        clearAvatarFlag: false,
    };
    state.currentMember = null;
}

// Handle Avatar File Change in Modal
function handleModalAvatarChange(event) {
    const file = event.target.files?.[0];
    state.modalErrorMessage = null; // Clear previous errors

    if (!file) {
        state.modalForm.avatarFile = null;
         if (state.modalForm.avatarPreviewUrl && state.modalForm.avatarPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(state.modalForm.avatarPreviewUrl);
        }
        state.modalForm.avatarPreviewUrl = state.isEditing && state.currentMember ? state.currentMember.avatar_url : null; // Restore original if editing, else null
        state.modalForm.clearAvatarFlag = false; // Clear clear flag if file input is emptied
         const avatarInput = document.getElementById('modal-avatar-upload');
         if(avatarInput) avatarInput.value = null;
        return;
    }

     // File type and size check
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.modalErrorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
        event.target.value = '';
        state.modalForm.avatarFile = null;
         return;
    }
    const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
        state.modalErrorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         event.target.value = '';
         state.modalForm.avatarFile = null;
        return;
    }

    state.modalForm.avatarFile = file;

    // Generate preview URL
     if (state.modalForm.avatarPreviewUrl && state.modalForm.avatarPreviewUrl.startsWith('blob:')) {
         URL.revokeObjectURL(state.modalForm.avatarPreviewUrl);
     }
     state.modalForm.avatarPreviewUrl = URL.createObjectURL(file);
     state.modalForm.clearAvatarFlag = false; // If a new file is selected, cancel the "clear avatar" flag
}

// Remove the selected new avatar file in the modal
function removeModalAvatar() {
    state.modalForm.avatarFile = null;
    if (state.modalForm.avatarPreviewUrl && state.modalForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.modalForm.avatarPreviewUrl);
    }
    // Restore original avatar URL if editing, otherwise set to null
    state.modalForm.avatarPreviewUrl = state.isEditing && state.currentMember ? state.currentMember.avatar_url : null;
    // Reset the file input element visually
     const avatarInput = document.getElementById('modal-avatar-upload');
     if(avatarInput) avatarInput.value = null;

     console.log("Modal: Selected new avatar file removed.");
}


// Save Member (Add or Edit) (API: POST /api/admin/members or PATCH /api/admin/members/:id)
async function saveMember() {
    if (!isAdminUser.value) {
         state.modalErrorMessage = '没有权限执行此操作。'; // Should not happen if button is disabled
         return;
    }

    state.modalErrorMessage = null;

    // Basic validation
    const form = state.modalForm;
    if (!form.teamCode || !form.color || !form.job || !form.maimaiId || !form.nickname || !form.qqNumber) {
        state.modalErrorMessage = '请填写所有必填字段。';
        return;
    }
     if (form.teamCode.length !== 4 || isNaN(parseInt(form.teamCode))) {
         state.modalErrorMessage = '组队码必须是4位数字。';
         return;
     }
     if (!/^[1-9][0-9]{4,14}$/.test(form.qqNumber.trim())) {
        state.modalErrorMessage = '请输入有效的QQ号码 (5-15位数字, 非0开头)。';
        return;
    }
     if (form.maimaiId.trim().length === 0 || form.maimaiId.trim().length > 13) {
         state.modalErrorMessage = '舞萌ID长度不正确 (应 ≤ 13位)。';
         return;
     }
      if (form.nickname.trim().length === 0 || form.nickname.trim().length > 50) {
          state.modalErrorMessage = '称呼长度需在1到50个字符之间。';
          return;
      }

    // Check color/job availability for the selected team (only if adding or changing)
    if (!state.isEditing || (form.color !== state.currentMember.color && !isColorAvailableInTeam.value(form.color))) {
         if (!isColorAvailableInTeam.value(form.color)) {
             state.modalErrorMessage = `颜色 '${getColorText(form.color)}' 在队伍 ${form.teamCode} 中已被占用。`;
             return;
         }
    }
     if (!state.isEditing || (form.job !== state.currentMember.job && !isJobAvailableInTeam.value(form.job))) {
         if (!isJobAvailableInTeam.value(form.job)) {
             state.modalErrorMessage = `职业 '${getJobText(form.job)}' 在队伍 ${form.teamCode} 中已被占用。`;
             return;
         }
     }


    state.isLoading = true; // Use global loading for the save operation

    const formData = new FormData();
    formData.append('teamCode', form.teamCode.trim());
    formData.append('color', form.color);
    formData.append('job', form.job);
    formData.append('maimaiId', form.maaimaiId.trim()); // Typo fixed? Should be maimaiId
    formData.append('nickname', form.nickname.trim());
    formData.append('qqNumber', form.qqNumber.trim());
    if (form.kindeUserId) { // Include Kinde ID if present
        formData.append('kindeUserId', form.kindeUserId.trim());
    } else {
         formData.append('kindeUserId', ''); // Send empty string if null to clear it on edit
    }


    // Handle avatar file and clear flag
    if (form.avatarFile) {
        formData.append('avatarFile', form.avatarFile);
        formData.append('clearAvatar', 'false'); // New file overrides clear
    } else if (form.clearAvatarFlag) {
        formData.append('clearAvatar', 'true');
    } else {
         // If no new file and clear flag is false, explicitly tell backend not to change avatar
         formData.append('clearAvatar', 'false');
         // Also, if editing and had an avatar, and didn't clear, send the existing URL?
         // No, backend should handle "no avatarFile + clearAvatar=false" as "keep existing".
         // Sending the URL in formData is not standard for file uploads.
    }


    const method = state.isEditing ? 'PATCH' : 'POST';
    const url = state.isEditing ? `${API_BASE_URL}/admin/members/${form.id}` : `${API_BASE_URL}/admin/members`;

    try {
        // Use authenticatedFetch - backend checks Kinde cookie and isAdmin status
        const response = await authenticatedFetch(url, {
            method: method,
            headers: {
                // 'X-Admin-API-Key': adminApiKey.value.trim(), // REMOVED API KEY
                // Content-Type is automatically set to multipart/form-data by fetch when using FormData body
            },
            // mode: 'cors', // authenticatedFetch handles mode and credentials
            body: formData,
        });

         // authenticatedFetch handles 401. Handle 403 specifically.
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             console.error('Admin API error (403 Forbidden):', data);
             state.modalErrorMessage = data.error || '没有权限执行此操作。';
             state.isLoading = false; // Stop loading
             // No need to set isAuthenticated = false here
             return; // Stop processing on 403
        }


        const data = await response.json().catch(() => ({})); // Handle non-JSON response on error

        if (!response.ok) {
            console.error(`API error saving member (${method} ${url}):`, response.status, data);
            throw new Error(data.error || `保存成员信息失败 (${response.status})`);
        }

        console.log('Member saved successfully:', data);
        state.modalErrorMessage = state.isEditing ? '信息更新成功！' : '成员添加成功！'; // Success message in modal

        // Refresh the member list after successful save
        await fetchMembers();

        // Close modal after a short delay to show success message
        setTimeout(() => {
            closeModal();
            state.errorMessage = null; // Clear global error if any
        }, 1500);

    } catch (e) {
        console.error('Fetch error saving member:', e);
        state.modalErrorMessage = e.message || '连接服务器失败，请稍后再试。';
         // authenticatedFetch handles 401 and sets isAuthenticated = false
    } finally {
        // state.isLoading is set to false after fetchMembers completes or on error
        // state.isLoading = false; // Removed from here
    }
}

// Delete Member (API: DELETE /api/admin/members/:id)
async function deleteMember(memberId) {
    if (!isAdminUser.value) {
        state.errorMessage = '没有权限执行此操作。';
        return;
    }

    if (!window.confirm('确定要删除此成员的报名信息吗？此操作不可撤销！')) {
        return; // User cancelled
    }

    state.isLoading = true;
    state.errorMessage = null;

    try {
        // Use authenticatedFetch - backend checks Kinde cookie and isAdmin status
        const response = await authenticatedFetch(`${API_BASE_URL}/admin/members/${memberId}`, {
            method: 'DELETE',
            headers: {
                // 'X-Admin-API-Key': adminApiKey.value.trim(), // REMOVED API KEY
            },
            // mode: 'cors', // authenticatedFetch handles mode and credentials
        });

         // authenticatedFetch handles 401. Handle 403 specifically.
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             console.error('Admin API error (403 Forbidden):', data);
             state.errorMessage = data.error || '没有权限执行此操作。';
             state.isLoading = false; // Stop loading
             return; // Stop processing on 403
        }


        // DELETE might return 204 No Content on success
        if (response.status === 204) {
            console.log(`Member ${memberId} deleted successfully (204 No Content).`);
            // Remove the member from the local list
            state.members = state.members.filter(m => m.id !== memberId);
            state.errorMessage = '成员信息已成功删除。'; // Show success message globally
             setTimeout(() => { state.errorMessage = null; }, 3000); // Clear message after 3s

        } else if (response.ok) {
             // Handle other 2xx responses if backend doesn't return 204
             console.log(`Member ${memberId} deleted successfully (unexpected ${response.status}).`);
             state.members = state.members.filter(m => m.id !== memberId);
             state.errorMessage = '成员信息已成功删除。';
             setTimeout(() => { state.errorMessage = null; }, 3000);

        } else {
            const data = await response.json().catch(() => ({}));
            console.error(`API error deleting member ${memberId}:`, response.status, data);
            throw new Error(data.error || `删除成员信息失败 (${response.status})`);
        }

    } catch (e) {
        console.error('Fetch error deleting member:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
         // authenticatedFetch handles 401 and sets isAuthenticated = false
    } finally {
        state.isLoading = false;
    }
}

// Export Members as CSV (API: GET /api/admin/export/csv)
async function exportCsv() {
    if (!isAdminUser.value) {
        state.errorMessage = '没有权限执行此操作。';
        return;
    }

    state.isLoading = true;
    state.errorMessage = null;

    try {
        // Use authenticatedFetch - backend checks Kinde cookie and isAdmin status
        const response = await authenticatedFetch(`${API_BASE_URL}/admin/export/csv`, {
            method: 'GET',
            headers: {
                // 'X-Admin-API-Key': adminApiKey.value.trim(), // REMOVED API KEY
            },
            // mode: 'cors', // authenticatedFetch handles mode and credentials
        });

         // authenticatedFetch handles 401. Handle 403 specifically.
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             console.error('Admin API error (403 Forbidden):', data);
             state.errorMessage = data.error || '没有权限执行此操作。';
             state.isLoading = false; // Stop loading
             return; // Stop processing on 403
        }


        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            console.error('API error exporting CSV:', response.status, data);
            throw new Error(data.error || `导出CSV失败 (${response.status})`);
        }

        // Get the filename from the Content-Disposition header if available
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'members_export.csv'; // Default filename
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        // Get the blob data and create a download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // Set the download filename
        document.body.appendChild(a); // Append to body to make it clickable
        a.click(); // Trigger the download
        document.body.removeChild(a); // Clean up
        window.URL.revokeObjectURL(url); // Release the object URL

        console.log('CSV export successful.');
        // No success message needed, download is the feedback

    } catch (e) {
        console.error('Fetch error exporting CSV:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
         // authenticatedFetch handles 401 and sets isAuthenticated = false
    } finally {
        state.isLoading = false;
    }
}

// Helper to format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
    return date.toLocaleString(); // Format as local date and time
}

// Handle Kinde Login button click
function handleLogin() {
    // Redirect to Kinde login page
    login(); // Use the login function from useKindeAuth
}

// Handle Kinde Logout button click
function handleLogout() {
    // Redirect to Kinde logout page via backend
    logout(); // Use the logout function from useKindeAuth
}

function createTriangleBackground() {
    const trianglesContainer = document.getElementById('triangles');
    if (!trianglesContainer) return;

    const colors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'];
    const triangleCount = 50;

    for (let i = 0; i < triangleCount; i++) {
        const triangle = document.createElement('div');
        triangle.classList.add('triangle');

        const size = Math.random() * 100 + 50;

        const left = Math.random() * 100;
        const top = Math.random() * 100 + 100;

        const color = colors[Math.floor(Math.random() * colors.length)];

        const duration = Math.random() * 30 + 20;

        const delay = Math.random() * 30;

        triangle.style.borderLeft = `${size / 2}px solid transparent`;
        triangle.style.borderRight = `${size / 2}px solid transparent`;
        triangle.style.borderBottom = `${size}px solid ${color}`;
        triangle.style.left = `${left}%`;
        triangle.style.top = `${top}%`;
        triangle.style.animationDuration = `${duration}s`;
        triangle.style.animationDelay = `${delay}s`;

        trianglesContainer.appendChild(triangle);
    }
}
// --- Lifecycle Hooks ---
onMounted(async () => {
    // Check auth status on mount. This will populate isAuthenticated, userMember, isAdminUser.
    await checkAuthStatus();

    // If authenticated and is admin, fetch members
    if (isAuthenticated.value && isAdminUser.value) {
        fetchMembers();
    }
    // If authenticated but NOT admin, show access denied message
    else if (isAuthenticated.value && !isAdminUser.value) {
         state.errorMessage = '您已登录，但没有管理员权限。';
    }
    // If not authenticated, the login button will be shown by the template

    // No need to load API key from local storage anymore

    // Create background triangles (assuming this is a visual effect)
    createTriangleBackground(); // Assuming this function exists elsewhere or is removed
});

onUnmounted(() => {
    // Clean up modal avatar preview URL if modal was open
     if (state.modalForm.avatarPreviewUrl && state.modalForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.modalForm.avatarPreviewUrl);
    }
});

// Watch for changes in isAdminUser to trigger fetchMembers
watch(isAdminUser, (newValue) => {
    if (newValue === true) {
        console.log("isAdminUser became true, fetching members...");
        fetchMembers(); // Fetch members when user gains admin status
        state.errorMessage = null; // Clear any previous auth/permission errors
    } else {
         // If user loses admin status (e.g., admin revoked it while they were logged in)
         state.members = []; // Clear member list
         state.errorMessage = '您的管理员权限已被移除。';
    }
});

// Watch for changes in isAuthenticated to handle logout/login state
watch(isAuthenticated, (newValue) => {
    if (newValue === false) {
        console.log("isAuthenticated became false.");
        state.members = []; // Clear member list on logout
        state.errorMessage = '您已退出登录。';
        // The template will show the login prompt
    }
});

</script>

<template>
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center px-4 py-8 sm:px-6 lg:px-8 relative">
        <!-- Background elements if any -->
        <div id="triangles" class="absolute inset-0 z-0 overflow-hidden"></div>

        <!-- Main Content Container -->
        <div class="w-full max-w-4xl mx-auto relative z-10">

            <!-- Header -->
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold mb-2">后台管理</h1>
                <p class="text-purple-300">管理报名成员信息</p>
            </div>

            <!-- Authentication/Authorization Section -->
            <div v-if="!isAuthenticated" class="glass rounded-3xl p-8 fade-in max-w-sm mx-auto">
                 <div class="text-center mb-6">
                     <img src="https://unpkg.com/lucide-static@latest/icons/lock.svg" class="w-12 h-12 text-purple-400 mx-auto mb-4" alt="Lock">
                     <h2 class="text-2xl font-bold mb-2">需要登录</h2>
                     <p class="text-gray-300 text-sm">请使用您的 Kinde 账号登录以访问管理面板。</p>
                 </div>
                 <!-- Removed API Key input -->
                 <button @click="handleLogin" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300">
                     使用 Kinde 登录
                 </button>
                 <!-- Error message is handled globally now -->
            </div>

             <!-- Access Denied Section (Authenticated but not Admin) -->
             <div v-else-if="isAuthenticated && !isAdminUser" class="glass rounded-3xl p-8 fade-in max-w-sm mx-auto text-center">
                 <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-12 h-12 text-red-400 mx-auto mb-4" alt="Access Denied">
                 <h2 class="text-2xl font-bold mb-2">权限不足</h2>
                 <p class="text-gray-300 mb-6">您的账号没有管理员权限，无法访问此页面。</p>
                 <button @click="handleLogout" class="btn-glow w-full bg-red-700 hover:bg-red-600 rounded-lg py-3 font-bold transition duration-300">
                     退出登录
                 </button>
                 <p v-if="state.errorMessage" class="mt-4 text-center text-red-400 text-sm">{{ state.errorMessage }}</p>
             </div>


            <!-- Admin Content (Authenticated AND Admin) -->
            <div v-else-if="isAuthenticated && isAdminUser" class="glass rounded-3xl p-6 fade-in">
                 <!-- Action Buttons -->
                 <div class="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0 sm:space-x-4">
                     <h2 class="text-2xl font-bold flex-shrink-0">成员列表 ({{ state.members.length }})</h2>
                     <div class="flex flex-wrap justify-center sm:justify-end items-center space-x-3">
                         <!-- Collection Status Toggle -->
                         <button
                             @click="toggleCollectionStatus"
                             :disabled="isTogglingCollection"
                             class="text-sm font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center"
                             :class="{
                                 'bg-yellow-600 hover:bg-yellow-700 text-white': !isCollectionPaused,
                                 'bg-green-600 hover:bg-green-700 text-white': isCollectionPaused,
                                 'opacity-50 cursor-not-allowed': isTogglingCollection
                             }"
                         >
                             <img :src="isCollectionPaused ? 'https://unpkg.com/lucide-static@latest/icons/play-circle.svg' : 'https://unpkg.com/lucide-static@latest/icons/circle-pause.svg'" class="w-4 h-4 mr-2" :alt="isCollectionPaused ? 'Resume' : 'Pause'">
                             {{ isTogglingCollection ? '切换中...' : (isCollectionPaused ? '恢复收集' : '暂停收集') }}
                         </button>

                         <button @click="openAddModal" class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center">
                             <img src="https://unpkg.com/lucide-static@latest/icons/plus.svg" class="w-4 h-4 mr-2" alt="Add">
                             添加成员
                         </button>
                         <button @click="exportCsv" :disabled="state.isLoading" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center" :class="{'opacity-50 cursor-not-allowed': state.isLoading}">
                             <img src="https://unpkg.com/lucide-static@latest/icons/download.svg" class="w-4 h-4 mr-2" alt="Export">
                             导出 CSV
                         </button>
                         <button @click="handleLogout" class="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center">
                             <img src="https://unpkg.com/lucide-static@latest/icons/log-out.svg" class="w-4 h-4 mr-2" alt="Logout">
                             退出登录
                         </button>
                     </div>
                 </div>

                 <!-- Global Error/Success message display area -->
                 <transition name="fade-in-up">
                     <div v-if="state.errorMessage && !state.showModal" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                         <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                         <span class="break-words flex-grow">{{ state.errorMessage }}</span>
                        <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.errorMessage = null" aria-label="关闭错误消息">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                 </transition>
                  <!-- Settings related messages -->
                 <transition name="fade-in-up">
                     <div v-if="settingsError" class="bg-yellow-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                         <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                         <span class="break-words flex-grow">{{ settingsError }}</span>
                        <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="settingsError = null" aria-label="关闭消息">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                 </transition>


                 <!-- Members Table -->
                 <div class="overflow-x-auto">
                     <table class="min-w-full divide-y divide-gray-700">
                         <thead class="bg-gray-800 bg-opacity-50">
                             <tr>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">队伍码</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">颜色</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">职业</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">舞萌ID</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">称呼</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">QQ号</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Kinde ID</th> <!-- ADDED Kinde ID column -->
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">管理员</th> <!-- ADDED isAdmin column -->
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">头像</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">加入时间</th>
                                 <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">更新时间</th>
                                 <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">操作</th>
                             </tr>
                         </thead>
                         <tbody class="divide-y divide-gray-800">
                             <tr v-if="state.isLoading && state.members.length === 0">
                                 <td colspan="13" class="px-4 py-4 text-center text-gray-500">加载中...</td>
                             </tr>
                              <tr v-else-if="!state.isLoading && state.members.length === 0">
                                 <td colspan="13" class="px-4 py-4 text-center text-gray-500">暂无成员数据。</td>
                             </tr>
                             <tr v-else v-for="member in state.members" :key="member.id" class="hover:bg-gray-800 transition-colors">
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{{ member.id }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{{ member.team_code }}</td>
                                 <!-- 修改颜色 td -->
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                     <div class="flex items-center">
                                         <span :class="`color-indicator color-${member.color}-bg mr-2`"></span>
                                         {{ getColorText(member.color) }}
                                     </div>
                                 </td>
                                 <!-- 修改职业 td -->
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                     <div class="flex items-center">
                                         <img :src="getIconPath('job', member.job)" class="w-4 h-4 inline-block mr-2 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                         {{ getJobText(member.job) }}
                                     </div>
                                 </td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-300">{{ member.maimai_id }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{{ member.nickname }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{{ member.qq_number }}</td>
                                 <td class="px-4 py-4 text-xs text-gray-400 truncate max-w-[100px]">{{ member.kinde_user_id || 'N/A' }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{{ member.is_admin === 1 ? '是' : '否' }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                     <img v-if="member.avatar_url" :src="member.avatar_url" alt="头像" class="w-8 h-8 rounded-full object-cover border border-gray-600">
                                     <span v-else class="text-gray-500">无</span>
                                 </td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-400">{{ formatTimestamp(member.joined_at) }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-400">{{ formatTimestamp(member.updated_at) }}</td>
                                 <td class="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                     <button @click="openEditModal(member)" class="text-indigo-400 hover:text-indigo-600 mr-4">编辑</button>
                                     <button @click="deleteMember(member.id)" class="text-red-400 hover:text-red-600">删除</button>
                                 </td>
                             </tr>
                         </tbody>
                     </table>
                 </div>
            </div>

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8 relative z-10">
                 <p>{{ new Date().getFullYear() }} © NGU Team © MPAM-Lab</p>
            </div>

        </div> <!-- End of Container -->

        <!-- Add/Edit Member Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4 text-center">{{ state.isEditing ? '修改成员信息' : '添加新成员' }}</h3>

                 <!-- Modal Error Message -->
                 <transition name="fade-in-up">
                     <div v-if="state.modalErrorMessage" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                         <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                         <span class="break-words flex-grow">{{ state.modalErrorMessage }}</span>
                        <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.modalErrorMessage = null" aria-label="关闭错误消息">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                 </transition>

                <form @submit.prevent="saveMember">
                    <div class="mb-4">
                        <label for="modal-team-code" class="block text-sm font-medium text-purple-300 mb-2">组队码 <span class="text-red-500">*</span></label>
                        <input type="text" id="modal-team-code" v-model="state.modalForm.teamCode" required placeholder="4位数字" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="4" :disabled="state.isEditing">
                         <p v-if="state.isEditing" class="mt-1 text-xs text-gray-400">编辑时无法修改组队码。</p>
                    </div>

                    <div class="mb-4">
                        <label for="modal-maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID <span class="text-red-500">*</span></label>
                        <input type="text" id="modal-maimai-id" v-model="state.modalForm.maimaiId" required placeholder="例如：Om1tted" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="13" :disabled="state.isEditing">
                         <p v-if="state.isEditing" class="mt-1 text-xs text-gray-400">编辑时无法修改舞萌ID。</p>
                    </div>

                    <div class="mb-4">
                        <label for="modal-nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="modal-nickname" v-model="state.modalForm.nickname" required placeholder="例如：om1t" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                    </div>

                    <div class="mb-4">
                        <label for="modal-qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="modal-qq-number" v-model="state.modalForm.qqNumber" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15">
                    </div>

                     <!-- ADDED: Kinde User ID field -->
                     <div class="mb-4">
                         <label for="modal-kinde-user-id" class="block text-sm font-medium text-purple-300 mb-2">Kinde用户ID (可选)</label>
                         <input type="text" id="modal-kinde-user-id" v-model="state.modalForm.kindeUserId" placeholder="例如：kp_..." class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                         <p class="mt-1 text-xs text-gray-400">关联到 Kinde 账号，用于用户自行修改信息。</p>
                     </div>


                    <div class="mb-4">
                        <label for="modal-color" class="block text-sm font-medium text-purple-300 mb-2">颜色 <span class="text-red-500">*</span></label>
                        <select id="modal-color" v-model="state.modalForm.color" required class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="" disabled>-- 选择颜色 --</option>
                            <option value="red" :disabled="!isColorAvailableInTeam('red')" :class="{'opacity-50': !isColorAvailableInTeam('red')}">{{ getColorText('red') }}</option>
                            <option value="green" :disabled="!isColorAvailableInTeam('green')" :class="{'opacity-50': !isColorAvailableInTeam('green')}">{{ getColorText('green') }}</option>
                            <option value="blue" :disabled="!isColorAvailableInTeam('blue')" :class="{'opacity-50': !isColorAvailableInTeam('blue')}">{{ getColorText('blue') }}</option>
                        </select>
                    </div>

                    <div class="mb-6">
                        <label for="modal-job" class="block text-sm font-medium text-purple-300 mb-2">职业 <span class="text-red-500">*</span></label>
                        <select id="modal-job" v-model="state.modalForm.job" required class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="" disabled>-- 选择职业 --</option>
                             <option value="attacker" :disabled="!isJobAvailableInTeam('attacker')" :class="{'opacity-50': !isJobAvailableInTeam('attacker')}">{{ getJobText('attacker') }}</option>
                            <option value="defender" :disabled="!isJobAvailableInTeam('defender')" :class="{'opacity-50': !isJobAvailableInTeam('defender')}">{{ getJobText('defender') }}</option>
                            <option value="supporter" :disabled="!isJobAvailableInTeam('supporter')" :class="{'opacity-50': !isJobAvailableInTeam('supporter')}">{{ getJobText('supporter') }}</option>
                        </select>
                    </div>

                     <!-- Avatar Upload Section in Modal -->
                     <div class="mb-6 text-center">
                         <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选, 最大 {{ MAX_AVATAR_SIZE_MB }}MB)</label>
                         <div class="flex flex-col items-center space-y-3">
                             <!-- Preview Image -->
                             <img v-if="state.modalForm.avatarPreviewUrl" :src="state.modalForm.avatarPreviewUrl" alt="头像预览" class="w-20 h-20 rounded-full object-cover border-2 border-purple-500 shadow-md">
                             <div v-else class="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                 <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-8 h-8 text-gray-400" alt="Default Avatar">
                             </div>
                              <!-- File Input Button -->
                             <label for="modal-avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                 {{ state.modalForm.avatarFile ? '更换图片' : '选择图片' }}
                             </label>
                             <!-- Hidden file input -->
                             <input type="file" id="modal-avatar-upload" @change="handleModalAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden">
                             <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>

                             <!-- Option to clear existing avatar (only if editing and has avatar) -->
                             <label v-if="state.isEditing && state.currentMember?.avatar_url" class="flex items-center cursor-pointer text-xs text-gray-300 hover:text-white transition">
                                 <input type="checkbox" v-model="state.modalForm.clearAvatarFlag" class="mr-1 h-3 w-3 text-red-600 focus:ring-red-500 border-gray-500 rounded bg-gray-700 outline-none">
                                 移除当前头像
                             </label>
                         </div>
                     </div> <!-- End Avatar Section -->


                    <div class="flex space-x-4 justify-center">
                        <button type="button" @click="closeModal" class="flex-1 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium max-w-[100px]">
                            取消
                        </button>
                        <button type="submit" :disabled="state.isLoading || !isAdminUser" class="flex-1 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium max-w-[180px]" :class="{'opacity-50 cursor-not-allowed': state.isLoading || !isAdminUser}">
                            {{ state.isLoading ? '保存中...' : (state.isEditing ? '保存更改' : '添加成员') }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Loading Overlay -->
        <!-- Show loading overlay only when a main action is loading AND modal is NOT open -->
        <div class="loading-overlay z-40" v-show="state.isLoading && !state.showModal">
            <div class="spinner"></div>
            <p class="mt-4 text-white">
                 {{ state.errorMessage ? state.errorMessage : '处理中，请稍候...' }}
            </p>
        </div>

    </div> <!-- End of Root Container -->
</template>

<style scoped>
/* Reuse styles from Index.vue */
/* Base styles */
.glass {
    background: rgba(31, 41, 55, 0.6); /* Darker glass */
    backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}
.input-code {
    font-weight: bold;
    text-align: center;
}
.btn-glow {
    box-shadow: 0 0 10px rgba(167, 139, 250, 0.4), 0 0 20px rgba(124, 58, 237, 0.3);
    transition: all 0.3s ease;
}
.btn-glow:hover:not(:disabled) {
    box-shadow: 0 0 15px rgba(167, 139, 250, 0.6), 0 0 30px rgba(124, 58, 237, 0.5);
    transform: translateY(-2px);
}
/* Transition for step content - using name="fade-in" */
.fade-in-enter-active, .fade-in-leave-active {
  transition: opacity 0.5s ease;
}
.fade-in-enter-from, .fade-in-leave-to {
  opacity: 0;
}

/* Transition for error message - name="fade-in-up" */
.fade-in-up-enter-active, .fade-in-up-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.fade-in-up-enter-from, .fade-in-up-leave-to {
  opacity: 0;
  transform: translateY(10px); /* Start slightly below */
}

/* Member List Indicator */
.color-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    vertical-align: middle;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
/* Background gradients for colors (reused) */
.color-red-bg { background: linear-gradient(135deg, #ef4444, #dc2626); }
.color-green-bg { background: linear-gradient(135deg, #22c55e, #16a34a); }
.color-blue-bg { background: linear-gradient(135deg, #3b82f6, #2563eb); }

/* Background gradients for jobs (reused) */
.job-attacker-bg { background: linear-gradient(135deg, #f97316, #ea580c); } /* Orange */
.job-defender-bg { background: linear-gradient(135deg, #6366f1, #4f46e5); } /* Indigo */
.job-supporter-bg { background: linear-gradient(135deg, #ec4899, #db2777); } /* Pink */


/* Form Inputs */
.form-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: all 0.3s ease;
    color: white; /* Ensure text is white */
}
.form-input:focus {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(167, 139, 250, 0.7); /* Purple border on focus */
    box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.3); /* Purple glow on focus */
    outline: none; /* Remove default outline */
}
/* Style checkbox */
input[type="checkbox"] {
  appearance: none;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0;
  display: inline-block;
  position: relative;
  cursor: pointer;
  border-radius: 4px; /* Slightly rounded checkboxes */
   vertical-align: middle; /* Align with text */
}
input[type="checkbox"]::before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 8px; /* Size of the checkmark */
    height: 8px;
    background-color: white;
    mask: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="20 6 9 17 4 12"%3E%3Cpolyline%3E%3C/polyline%3E%3C/svg%3E') no-repeat center center;
    mask-size: contain;
    transition: transform 0.2s ease-in-out;
}
input[type="checkbox"]:checked {
  background-color: #8b5cf6; /* Purple check */
  border-color: #a78bfa;
}
input[type="checkbox"]:checked::before {
  transform: translate(-50%, -50%) scale(1); /* Show checkmark */
}
input[type="checkbox"]:focus {
  outline: 2px solid #a78bfa; /* Focus ring for accessibility */
  outline-offset: 2px;
}
/* Red checkbox for delete confirm */
input[type="checkbox"].text-red-600:checked {
    background-color: #dc2626; /* Red check */
    border-color: #ef4444;
     outline-color: #ef4444;
}
::-webkit-input-placeholder { /* WebKit, Blink, Edge */
    color:    #6b7280; /* gray-500 */
    opacity: 0.8;
}
:-moz-placeholder { /* Mozilla Firefox 4 to 18 */
   color:    #6b7280;
   opacity:  0.8;
}
::-moz-placeholder { /* Mozilla Firefox 19+ */
   color:    #6b7280;
   opacity:  0.8;
}
:-ms-input-placeholder { /* Internet Explorer 10-11 */
   color:    #6b7280;
   opacity: 0.8;
}
::-ms-input-placeholder { /* Microsoft Edge */
   color:    #6b7280;
   opacity: 0.8;
}
::placeholder { /* Most modern browsers */
   color:    #6b7280;
   opacity: 0.8;
}

/* SELECT styling (improve native select appearance) */
select.form-input {
    /* Add custom styling for dropdown arrow if appearance: none; is used */
    background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="6 9 12 15 18 9"%3E%3Cpolyline%3E%3C/polyline%3E%3C/svg%3E');
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    background-size: 1em auto;
    padding-right: 2.5rem; /* Make room for the arrow */
}

/* Loading Overlay */
.loading-overlay {
    position: fixed;
    inset: 0; /* top, right, bottom, left = 0 */
    background: rgba(17, 24, 39, 0.8); /* bg-gray-900 with opacity */
    backdrop-filter: blur(4px);
    z-index: 40; /* Ensure it's above content but below modals (z-50) */
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: white;
    text-align: center;
    transition: opacity 0.3s ease;
}
.spinner {
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    border-top-color: #a78bfa; /* Purple */
    width: 40px;
    height: 40px;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
}
@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Member list avatar border color based on role color */
.border-red-500 { border-color: #ef4444; }
.border-green-500 { border-color: #22c55e; }
.border-blue-500 { border-color: #3b82f6; }

/* Table specific styles */
table {
    border-collapse: separate; /* Allows rounded corners */
    border-spacing: 0;
}

thead tr:first-child th:first-child {
    border-top-left-radius: 1rem; /* Match glass container */
}
thead tr:first-child th:last-child {
    border-top-right-radius: 1rem; /* Match glass container */
}
/* Add bottom radius to last row if needed, but overflow-x-auto makes it tricky */
/* tbody tr:last-child td:first-child {
    border-bottom-left-radius: 1rem;
}
tbody tr:last-child td:last-child {
    border-bottom-right-radius: 1rem;
} */

th, td {
    /* Add some padding if needed, already in classes */
     white-space: nowrap; 
}

/* Style for disabled select options */
select option:disabled {
    color: #6b7280; /* gray-500 */
}

</style>
<!-- Global styles for background triangles (reused) -->
<style>
.triangle {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0.1;
    will-change: transform;
    animation: float 20s infinite linear;
}

@keyframes float {
    0% {
        transform: translateY(0) rotate(0deg);
        opacity: 0.1;
    }
    50% {
         opacity: 0.15;
    }
    100% {
         transform: translateY(calc(-100vh - 150px)) rotate(360deg);
        opacity: 0;
    }
}

/* Triangle Background Animation */
#triangles {
    pointer-events: none;
    z-index: 0;
}

.triangle {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0.1; /* Adjust opacity */
    animation: floatUp ease-in infinite;
}

@keyframes floatUp {
    0% {
        transform: translateY(0) rotate(0deg);
        opacity: 0.1;
    }
    50% {
         opacity: 0.05;
    }
    100% {
        transform: translateY(-200vh) rotate(720deg); /* Float up and rotate */
        opacity: 0;
    }
}
</style>
