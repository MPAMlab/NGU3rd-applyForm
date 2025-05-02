<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue';
import { useRoute } from 'vue-router'; // Import useRoute
// ADDED: Import Kinde client and potentially user state
import { kindeClient } from '../auth'; // Adjust path
// You might want a global state management (Pinia/Vuex) for auth status and user info
// For simplicity, let's use local state and SDK methods directly for now.

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
const R2_PUBLIC_URL_BASE = import.meta.env.VITE_R2_PUBLIC_URL_BASE || 'https://ngu3-signup-bucket.srt.pub';
const MAX_AVATAR_SIZE_MB = 2;

// --- State Management ---
const route = useRoute(); // Get current route

const state = reactive({
    // Existing team check state
    teamCode: '',
    teamName: '',
    teamExists: false,
    teamMembers: [], // Members fetched during team check

    // ADDED: Kinde Auth State
    isAuthenticated: false,
    kindeUser: null, // Kinde user object { id, email, name, ... }
    isCheckingAuth: true, // Initial check

    // ADDED: User's Registration State
    userMember: null, // The member object if the logged-in user has registered
    isCheckingRegistration: false,

    // Form state (used for NEW registration)
    form: {
        color: '',
        job: '',
        maimaiId: '',
        nickname: '',
        qqNumber: '',
        avatarFile: null,
        avatarPreviewUrl: null,
        privacyAgreed: false,
    },

    // UI State
    currentStep: 1, // 1: Team Check, 2: Registration Form / User Info
    isLoading: false,
    errorMessage: null,
    successMessage: null, // For registration success

    // Modal State (for user edit/delete)
    showEditModal: false,
    editForm: { // Form fields for editing
        nickname: null,
        qqNumber: null,
        color: null,
        job: null,
        avatarFile: null,
        avatarPreviewUrl: null,
        clearAvatarFlag: false,
    },
    editModalErrorMessage: null,
    isSavingEdit: false,
});

// --- Computed Properties ---
// Existing computed properties for color/job text/icons
function getColorText(colorId) { /* ... */ }
function getJobText(jobType) { /* ... */ }
function getIconPath(type, value) { /* ... */ }

// ADDED: Check if a color is available in the user's team (for edit modal)
const isColorAvailableInUserTeam = computed(() => (color) => {
    if (!state.userMember || !state.userMember.team_code) return true; // Should not happen if userMember exists
    const membersInUserTeam = state.teamMembers.filter(m => m.team_code === state.userMember.team_code);

    // The user's current color is always available to them
    if (state.userMember.color === color) return true;

    // Check if any *other* member in this team has this color
    return !membersInUserTeam.some(m => m.color === color && m.maimai_id !== state.userMember.maimai_id); // Use maimai_id or id
});

// ADDED: Check if a job is available in the user's team (for edit modal)
const isJobAvailableInUserTeam = computed(() => (job) => {
    if (!state.userMember || !state.userMember.team_code) return true;
    const membersInUserTeam = state.teamMembers.filter(m => m.team_code === state.userMember.team_code);

    // The user's current job is always available to them
    if (state.userMember.job === job) return true;

    // Check if any *other* member in this team has this job
    return !membersInUserTeam.some(m => m.job === job && m.maimai_id !== state.userMember.maimai_id); // Use maimai_id or id
});


// --- Methods / Functions ---

// ADDED: Kinde Auth Methods
async function login() {
    state.errorMessage = null;
    try {
        await kindeClient.login(); // Redirects to Kinde
    } catch (e) {
        console.error("Kinde login failed:", e);
        state.errorMessage = '登录失败，请稍后再试。';
    }
}

async function register() {
     state.errorMessage = null;
    try {
        await kindeClient.register(); // Redirects to Kinde
    } catch (e) {
        console.error("Kinde register failed:", e);
        state.errorMessage = '注册失败，请稍后再试。';
    }
}

async function logout() {
     state.errorMessage = null;
    try {
        await kindeClient.logout(); // Redirects to Kinde
        // After redirect, the callback page or logout_redirect_uri handles clearing state
    } catch (e) {
        console.error("Kinde logout failed:", e);
        state.errorMessage = '登出失败，请稍后再试。';
    }
}

// ADDED: Check Authentication Status and Fetch User Info
async function checkAuthAndFetchUser() {
    state.isCheckingAuth = true;
    state.errorMessage = null;
    try {
        state.isAuthenticated = await kindeClient.isAuthenticated();
        if (state.isAuthenticated) {
            state.kindeUser = await kindeClient.getUser();
            console.log("Authenticated Kinde User:", state.kindeUser);
            // If authenticated, try to fetch their registration info
            await fetchUserRegistration();
        } else {
            state.kindeUser = null;
            state.userMember = null; // Clear user member state if not authenticated
        }
    } catch (e) {
        console.error("Error checking Kinde auth or getting user:", e);
        state.errorMessage = '获取登录状态失败。';
        state.isAuthenticated = false;
        state.kindeUser = null;
        state.userMember = null;
    } finally {
        state.isCheckingAuth = false;
    }
}

// ADDED: Fetch User's Registration Info (API: GET /api/members/me)
async function fetchUserRegistration() {
    if (!state.isAuthenticated || !state.kindeUser) {
        state.userMember = null;
        return;
    }
    state.isCheckingRegistration = true;
    state.errorMessage = null;
    try {
        // Get the access token to include in the request header
        const accessToken = await kindeClient.getToken();
        if (!accessToken) {
             console.warn("No access token available for fetching user registration.");
             state.userMember = null;
             state.errorMessage = '认证信息无效，请重新登录。';
             // Optionally trigger re-login or token refresh
             return;
        }

        const response = await fetch(`${API_BASE_URL}/members/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Include the token
                'Content-Type': 'application/json',
            },
            mode: 'cors',
        });

        const data = await response.json();

        if (!response.ok) {
             // Handle 401 specifically if token expired/invalid
             if (response.status === 401 || response.status === 403) {
                  state.errorMessage = '认证失败，请重新登录。';
                  // Optionally clear auth state and prompt login
                  state.isAuthenticated = false;
                  state.kindeUser = null;
                  state.userMember = null;
             } else {
                console.error('API error fetching user registration:', response.status, data);
                state.errorMessage = data.error || `获取报名信息失败 (${response.status})`;
             }
             state.userMember = null; // Ensure userMember is null on error
        } else {
            // Success
            state.userMember = data.member; // Backend returns { member: {...} } or { member: null }
            console.log("User Registration Data:", state.userMember);
            if (state.userMember) {
                // If user is registered, fetch their team details to show team members
                state.teamCode = state.userMember.team_code; // Set team code for team check logic
                await checkTeam(); // Fetch team details and members
            } else {
                 // User is authenticated but not registered, clear team info
                 state.teamCode = '';
                 state.teamName = '';
                 state.teamExists = false;
                 state.teamMembers = [];
            }
        }

    } catch (e) {
        console.error('Fetch error fetching user registration:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.userMember = null;
    } finally {
        state.isCheckingRegistration = false;
    }
}


// Existing checkTeam function (MODIFIED to fetch full member details)
async function checkTeam() {
    if (!state.teamCode || state.teamCode.length !== 4 || isNaN(parseInt(state.teamCode))) {
        state.teamExists = false;
        state.teamName = '';
        state.teamMembers = [];
        state.errorMessage = null; // Clear error if code is invalid
        return;
    }

    state.isLoading = true;
    state.errorMessage = null;
    state.teamExists = false; // Reset state before fetch

    try {
        // MODIFIED: Use the new GET /api/teams/:code endpoint which returns full member details
        const response = await fetch(`${API_BASE_URL}/teams/${state.teamCode}`, {
            method: 'GET', // Changed to GET
            headers: {
                'Content-Type': 'application/json',
                // No auth needed for public team check
            },
            mode: 'cors',
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('API error checking team:', response.status, data);
             // If team not found (404), it's not an error for the user, just means it doesn't exist
             if (response.status === 404) {
                 state.teamExists = false;
                 state.teamName = '';
                 state.teamMembers = [];
                 // No error message for 404, it's expected flow
             } else {
                state.errorMessage = data.error || `查询队伍失败 (${response.status})`;
                state.teamExists = false;
                state.teamName = '';
                state.teamMembers = [];
             }
        } else {
            // Team found
            state.teamExists = true;
            state.teamCode = data.code; // Ensure state matches fetched data
            state.teamName = data.name;
            state.teamMembers = data.members || []; // Assuming backend returns { code, name, members: [...] }
            state.errorMessage = null; // Clear error on success
        }

    } catch (e) {
        console.error('Fetch error checking team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.teamExists = false;
        state.teamName = '';
        state.teamMembers = [];
    } finally {
        state.isLoading = false;
    }
}

// Existing createTeam function (Keep as is, no auth needed)
async function createTeam() { /* ... */ }

// Existing handleAvatarChange function (Keep as is for NEW registration form)
function handleAvatarChange(event) { /* ... */ }

// Existing removeAvatar function (Keep as is for NEW registration form)
function removeAvatar() { /* ... */ }

// Existing submitRegistration function (MODIFIED - Requires Kinde Auth)
async function submitRegistration() {
    state.errorMessage = null;
    state.successMessage = null;

    // Basic validation (Keep existing)
    const form = state.form;
    if (!form.teamCode || !form.color || !form.job || !form.maimaiId || !form.nickname || !form.qqNumber || !form.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私条款。';
        return;
    }
     if (form.teamCode.length !== 4 || isNaN(parseInt(form.teamCode))) {
         state.errorMessage = '组队码必须是4位数字。';
         return;
     }
     if (!/^[1-9][0-9]{4,14}$/.test(form.qqNumber.trim())) {
        state.errorMessage = '请输入有效的QQ号码 (5-15位数字, 非0开头)。';
        return;
    }
     if (form.maimaiId.trim().length === 0 || form.maimaiId.trim().length > 13) {
         state.errorMessage = '舞萌ID长度不正确 (应 ≤ 13位)。';
         return;
     }
      if (form.nickname.trim().length === 0 || form.nickname.trim().length > 50) {
          state.errorMessage = '称呼长度需在1到50个字符之间。';
          return;
      }

    // Check color/job availability in the team (Need to re-fetch team members if not already done or if teamCode changed)
    // For simplicity, let's rely on backend conflict check for now, or ensure checkTeam is called before showing form.
    // A more robust approach would check availability client-side before submitting.

    state.isLoading = true;

    const formData = new FormData();
    formData.append('teamCode', form.teamCode.trim());
    formData.append('color', form.color);
    formData.append('job', form.job);
    formData.append('maimaiId', form.maimaiId.trim());
    formData.append('nickname', form.nickname.trim());
    formData.append('qqNumber', form.qqNumber.trim());
    if (form.avatarFile) {
        formData.append('avatarFile', form.avatarFile);
    }
    // privacyAgreed is handled client-side validation, not sent to backend

    try {
        // Get the access token to include in the request header
        const accessToken = await kindeClient.getToken();
         if (!accessToken) {
             state.errorMessage = '认证信息无效，请重新登录。';
             state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
             state.isLoading = false;
             return;
         }

        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Include the token
                // Content-Type is automatically set to multipart/form-data by fetch with FormData
            },
            mode: 'cors',
            body: formData,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('API error submitting registration:', response.status, data);
             // Handle 401/403 specifically
             if (response.status === 401 || response.status === 403) {
                  state.errorMessage = '认证失败，请重新登录。';
                  state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
             } else {
                state.errorMessage = data.error || `报名失败 (${response.status})`;
             }
        } else {
            // Registration successful
            state.successMessage = '报名成功！';
            console.log('Registration successful:', data);

            // Update local state with the new member info
            // The backend returns the updated team members, but not the specific new member with ID etc.
            // A better approach is for the backend to return the newly created member object.
            // Assuming backend returns the new member object in 'data.member' (update backend if needed)
            // Or, re-fetch user registration after success
            await fetchUserRegistration(); // Re-fetch user's registration status and data

            // Optionally reset form or redirect
            // state.form = { ... }; // Reset form fields
            // state.currentStep = 1; // Go back to team check (or show success message)

            // Clear success message after a delay
            setTimeout(() => { state.successMessage = null; }, 3000);
        }

    } catch (e) {
        console.error('Fetch error submitting registration:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
    } finally {
        state.isLoading = false;
    }
}

// ADDED: Open Edit Member Modal (for logged-in user)
function openEditModal() {
    if (!state.userMember) return; // Should only be called if user is registered

    state.showEditModal = true;
    state.editModalErrorMessage = null;
    // Populate edit form from userMember data
    state.editForm = {
        nickname: state.userMember.nickname,
        qqNumber: state.userMember.qq_number,
        color: state.userMember.color,
        job: state.userMember.job,
        avatarFile: null, // No file selected initially
        avatarPreviewUrl: state.userMember.avatar_url, // Show current avatar
        clearAvatarFlag: false, // Not checked initially
    };
}

// ADDED: Close Edit Modal
function closeEditModal() {
    state.showEditModal = false;
    state.editModalErrorMessage = null;
     if (state.editForm.avatarPreviewUrl && state.editForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editForm.avatarPreviewUrl);
    }
    state.editForm = { ... }; // Reset form state
}

// ADDED: Handle Avatar File Change in Edit Modal
function handleEditModalAvatarChange(event) {
    const file = event.target.files?.[0];
    state.editModalErrorMessage = null;

    if (!file) {
        state.editForm.avatarFile = null;
         if (state.editForm.avatarPreviewUrl && state.editForm.avatarPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(state.editForm.avatarPreviewUrl);
        }
        state.editForm.avatarPreviewUrl = state.userMember ? state.userMember.avatar_url : null; // Restore original
        state.editForm.clearAvatarFlag = false;
         const avatarInput = document.getElementById('edit-modal-avatar-upload');
         if(avatarInput) avatarInput.value = null;
        return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.editModalErrorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
        event.target.value = ''; state.editForm.avatarFile = null; return;
    }
    const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
        state.editModalErrorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         event.target.value = ''; state.editForm.avatarFile = null; return;
    }

    state.editForm.avatarFile = file;
     if (state.editForm.avatarPreviewUrl && state.editForm.avatarPreviewUrl.startsWith('blob:')) {
         URL.revokeObjectURL(state.editForm.avatarPreviewUrl);
     }
     state.editForm.avatarPreviewUrl = URL.createObjectURL(file);
     state.editForm.clearAvatarFlag = false;
}

// ADDED: Remove the selected new avatar file in the Edit modal
function removeEditModalAvatar() {
    state.editForm.avatarFile = null;
    if (state.editForm.avatarPreviewUrl && state.editForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editForm.avatarPreviewUrl);
    }
    state.editForm.avatarPreviewUrl = state.userMember ? state.userMember.avatar_url : null;
     const avatarInput = document.getElementById('edit-modal-avatar-upload');
     if(avatarInput) avatarInput.value = null;
     console.log("Edit Modal: Selected new avatar file removed.");
}


// ADDED: Save Member Edit (API: PATCH /api/members/:maimaiId)
async function saveMemberEdit() {
    state.editModalErrorMessage = null;
    if (!state.userMember) return; // Should only be called if user is registered

    // Basic validation (similar to registration)
    const form = state.editForm;
    if (!form.nickname || !form.qqNumber || !form.color || !form.job) {
        state.editModalErrorMessage = '请填写所有必填字段。';
        return;
    }
     if (!/^[1-9][0-9]{4,14}$/.test(form.qqNumber.trim())) {
        state.editModalErrorMessage = '请输入有效的QQ号码 (5-15位数字, 非0开头)。';
        return;
    }
      if (form.nickname.trim().length === 0 || form.nickname.trim().length > 50) {
          state.editModalErrorMessage = '称呼长度需在1到50个字符之间。';
          return;
      }

    // Check color/job availability in the user's team (client-side check)
    if (form.color !== state.userMember.color && !isColorAvailableInUserTeam.value(form.color)) {
         state.editModalErrorMessage = `颜色 '${getColorText(form.color)}' 在你的队伍中已被占用。`;
         return;
    }
     if (form.job !== state.userMember.job && !isJobAvailableInUserTeam.value(form.job)) {
         state.editModalErrorMessage = `职业 '${getJobText(form.job)}' 在你的队伍中已被占用。`;
         return;
     }


    state.isSavingEdit = true; // Use a separate loading state for the modal

    const formData = new FormData();
    // Only append fields that might have changed
    if (form.nickname !== state.userMember.nickname) formData.append('nickname', form.nickname.trim());
    if (form.qqNumber !== state.userMember.qq_number) formData.append('qqNumber', form.qqNumber.trim());
    if (form.color !== state.userMember.color) formData.append('color', form.color);
    if (form.job !== state.userMember.job) formData.append('job', form.job);

    // Handle avatar file and clear flag
    if (form.avatarFile) {
        formData.append('avatarFile', form.avatarFile);
        formData.append('clearAvatar', 'false'); // New file overrides clear
    } else if (form.clearAvatarFlag) {
        formData.append('clearAvatar', 'true');
    }
    // If neither a new file nor clear flag is set, don't append anything for avatar, backend ignores it.


    try {
        // Get the access token
        const accessToken = await kindeClient.getToken();
         if (!accessToken) {
             state.editModalErrorMessage = '认证信息无效，请重新登录。';
             state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
             state.isSavingEdit = false;
             closeEditModal();
             return;
         }

        // Use the user's Maimai ID in the URL path
        const response = await fetch(`${API_BASE_URL}/members/${state.userMember.maimai_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Include the token
                // Content-Type is automatically set to multipart/form-data
            },
            mode: 'cors',
            body: formData,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('API error saving member edit:', response.status, data);
             if (response.status === 401 || response.status === 403) {
                  state.editModalErrorMessage = '认证失败，请重新登录。';
                  state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
                  closeEditModal();
             } else {
                state.editModalErrorMessage = data.error || `保存更改失败 (${response.status})`;
             }
        } else {
            // Edit successful
            state.editModalErrorMessage = '信息更新成功！';
            console.log('Member edit successful:', data);

            // Update local userMember state with the returned data
            state.userMember = data.member; // Backend returns the updated member

            // Re-fetch team details to update the team member list display
            await checkTeam();

            // Close modal after a short delay
            setTimeout(() => {
                closeEditModal();
                state.errorMessage = null; // Clear global error if any
            }, 1500);
        }

    } catch (e) {
        console.error('Fetch error saving member edit:', e);
        state.editModalErrorMessage = e.message || '连接服务器失败，请稍后再试。';
    } finally {
        state.isSavingEdit = false;
    }
}

// ADDED: Delete Member (for logged-in user) (API: DELETE /api/members/:maimaiId)
async function deleteMember() {
    if (!state.userMember) return; // Should only be called if user is registered

    if (!window.confirm('确定要删除你的报名信息吗？此操作不可撤销！')) {
        return; // User cancelled
    }

    state.isLoading = true; // Use global loading for delete
    state.errorMessage = null;

    try {
        const accessToken = await kindeClient.getToken();
         if (!accessToken) {
             state.errorMessage = '认证信息无效，请重新登录。';
             state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
             state.isLoading = false;
             return;
         }

        // Use the user's Maimai ID in the URL path
        const response = await fetch(`${API_BASE_URL}/members/${state.userMember.maimai_id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`, // Include the token
            },
            mode: 'cors',
        });

        // DELETE might return 204 No Content on success
        if (response.status === 204 || response.ok) { // Check for 204 or any 2xx
            console.log(`Member ${state.userMember.maimai_id} deleted successfully.`);
            state.successMessage = '报名信息已成功删除。';

            // Clear user member state and reset to step 1
            state.userMember = null;
            state.currentStep = 1;
            state.teamCode = ''; // Clear team code to reset team check section
            state.teamName = '';
            state.teamExists = false;
            state.teamMembers = [];
            state.form = { ... }; // Reset registration form

             setTimeout(() => { state.successMessage = null; }, 3000); // Clear success message

        } else {
            const data = await response.json().catch(() => ({}));
            console.error(`API error deleting member ${state.userMember.maimai_id}:`, response.status, data);
             if (response.status === 401 || response.status === 403) {
                  state.errorMessage = '认证失败，请重新登录。';
                  state.isAuthenticated = false; state.kindeUser = null; state.userMember = null;
             } else {
                state.errorMessage = data.error || `删除报名信息失败 (${response.status})`;
             }
        }

    } catch (e) {
        console.error('Fetch error deleting member:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
    } finally {
        state.isLoading = false;
    }
}


// --- Lifecycle Hooks ---
onMounted(() => {
    // Check auth status and fetch user registration on mount
    checkAuthAndFetchUser();

    // Check if there's a redirect query param after login/register
    if (route.query.redirect) {
         // You could potentially redirect the user back here
         // Or just clear the query param
         // router.replace({ query: {} }); // Clear query params
    }
     // Check for login/register success messages from Kinde callback if needed
     // Kinde callback endpoint on backend sets cookies, frontend just needs to know it happened
     // checkAuthAndFetchUser handles the state update after callback redirect
});

onUnmounted(() => {
    // Clean up avatar preview URL if modal was open
     if (state.form.avatarPreviewUrl && state.form.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.form.avatarPreviewUrl);
    }
     if (state.editForm.avatarPreviewUrl && state.editForm.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editForm.avatarPreviewUrl);
    }
});

// Watch teamCode changes to trigger team check (Existing)
watch(() => state.teamCode, (newCode) => {
    if (newCode && newCode.length === 4 && !isNaN(parseInt(newCode))) {
        checkTeam();
    } else {
         state.teamExists = false;
         state.teamName = '';
         state.teamMembers = [];
         state.errorMessage = null;
    }
});

// Watch userMember state to update currentStep
watch(() => state.userMember, (newUserMember) => {
    if (newUserMember) {
        state.currentStep = 2; // Show user info/edit section
        // Populate teamCode for team check display
        state.teamCode = newUserMember.team_code;
        checkTeam(); // Fetch team details for display
    } else {
        // User is not registered or registration was deleted
        state.currentStep = 1; // Show team check/registration prompt
        // Keep teamCode if user was just deleted, so they can re-register in the same team easily
        // Or clear it: state.teamCode = '';
    }
});

// Watch isAuthenticated state to potentially redirect or show login prompt
watch(() => state.isAuthenticated, (newVal) => {
    if (!newVal) {
        // User logged out or auth failed, clear user specific state
        state.kindeUser = null;
        state.userMember = null;
        // Optionally redirect to home or show a login required message
        // router.push('/'); // Example redirect
    }
});


</script>

<template>
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center px-4 py-8 sm:px-6 lg:px-8 relative">
        <!-- Background elements -->
        <div id="triangles" class="absolute inset-0 z-0 overflow-hidden"></div>

        <!-- Main Content Container -->
        <div class="w-full max-w-2xl mx-auto relative z-10">

            <!-- Header -->
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold mb-2">NGU 3rd 报名</h1>
                <p class="text-purple-300">组建你的队伍，加入挑战！</p>
            </div>

            <!-- Loading Overlay -->
            <div class="loading-overlay z-40" v-show="state.isLoading || state.isCheckingAuth || state.isCheckingRegistration">
                <div class="spinner"></div>
                <p class="mt-4 text-white">
                     {{ state.isCheckingAuth ? '检查登录状态...' : state.isCheckingRegistration ? '检查报名信息...' : state.errorMessage ? state.errorMessage : '处理中，请稍候...' }}
                </p>
            </div>

             <!-- Error message display area -->
             <transition name="fade-in-up">
                 <div v-if="state.errorMessage && !state.isLoading && !state.showEditModal" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                     <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                     <span class="break-words flex-grow">{{ state.errorMessage }}</span>
                    <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.errorMessage = null" aria-label="关闭错误消息">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
             </transition>

             <!-- Success message display area -->
             <transition name="fade-in-up">
                 <div v-if="state.successMessage && !state.isLoading && !state.showEditModal" class="bg-green-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                     <img src="https://unpkg.com/lucide-static@latest/icons/circle-check.svg" class="w-5 h-5 mr-3 text-green-300 flex-shrink-0 mt-0.5" alt="Success">
                     <span class="break-words flex-grow">{{ state.successMessage }}</span>
                    <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.successMessage = null" aria-label="关闭成功消息">
                        <svg xmlns="http://www.wende.dev/icons/x.svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
             </transition>


            <!-- Step 1: Team Check / Login Prompt -->
            <div v-if="state.currentStep === 1 && !state.isLoading" class="glass rounded-3xl p-8 fade-in">
                <h2 class="text-2xl font-bold text-center mb-6">查找或创建队伍</h2>

                <div class="mb-6">
                    <label for="team-code" class="block text-sm font-medium text-purple-300 mb-2">输入队伍码</label>
                    <input
                        type="text"
                        id="team-code"
                        v-model="state.teamCode"
                        placeholder="输入4位队伍码"
                        class="form-input input-code w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                        maxlength="4"
                        inputmode="numeric"
                        @input="state.teamCode = state.teamCode.replace(/[^0-9]/g, '')"
                        @keydown.enter="checkTeam"
                    >
                </div>

                <!-- Team Info / Create Team / Login/Register -->
                <div v-if="state.teamCode.length === 4">
                    <div v-if="state.isLoading" class="text-center text-gray-400">加载队伍信息...</div>
                    <div v-else-if="state.teamExists" class="border border-gray-700 rounded-lg p-4 mb-6">
                        <h3 class="text-xl font-bold mb-2">{{ state.teamName }} ({{ state.teamCode }})</h3>
                        <p class="text-gray-300 text-sm mb-4">队伍成员 ({{ state.teamMembers.length }}/3):</p>
                        <ul class="space-y-2">
                            <li v-for="member in state.teamMembers" :key="member.maimai_id" class="flex items-center text-gray-300 text-sm">
                                <span :class="`color-indicator color-${member.color}-bg mr-2`"></span>
                                <img :src="getIconPath('job', member.job)" class="w-4 h-4 inline-block mr-2 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                {{ member.nickname }} ({{ member.maimai_id }})
                            </li>
                            <li v-if="state.teamMembers.length < 3" class="text-gray-500 text-sm italic">虚位以待...</li>
                        </ul>

                        <div class="mt-6 text-center">
                            <p class="text-gray-300 mb-4">加入此队伍需要登录/注册：</p>
                            <div v-if="state.isCheckingAuth" class="text-gray-400">检查登录状态...</div>
                            <div v-else-if="!state.isAuthenticated">
                                 <button @click="login" class="btn-glow bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg transition duration-300 mr-4">
                                     登录
                                 </button>
                                 <button @click="register" class="bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-3 px-6 rounded-lg transition duration-300">
                                     注册
                                 </button>
                            </div>
                            <div v-else>
                                 <!-- User is authenticated but not registered -->
                                 <p class="text-green-400 mb-4">你已登录为 {{ state.kindeUser?.name || state.kindeUser?.email }}。</p>
                                 <button @click="state.currentStep = 2" class="btn-glow bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300">
                                     填写报名信息
                                 </button>
                                 <button @click="logout" class="ml-4 text-gray-400 hover:text-white text-sm">
                                     登出
                                 </button>
                            </div>
                        </div>

                    </div>
                    <div v-else class="text-center">
                        <p class="text-gray-300 mb-4">队伍码 {{ state.teamCode }} 不存在。</p>
                        <p class="text-gray-300 mb-4">你可以创建这个队伍：</p>
                        <div class="mb-4">
                            <label for="new-team-name" class="block text-sm font-medium text-purple-300 mb-2">新队伍名称</label>
                            <input type="text" id="new-team-name" v-model="state.teamName" placeholder="输入队伍名称" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                        </div>
                        <button @click="createTeam" :disabled="!state.teamName || state.isLoading" class="btn-glow bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300" :class="{'opacity-50 cursor-not-allowed': !state.teamName || state.isLoading}">
                            创建队伍并报名
                        </button>
                    </div>
                </div>
            </div>

            <!-- Step 2: Registration Form / User Info -->
            <div v-if="state.currentStep === 2 && !state.isLoading" class="glass rounded-3xl p-8 fade-in">
                <!-- If user is registered -->
                <div v-if="state.userMember">
                     <h2 class="text-2xl font-bold text-center mb-6">你的报名信息</h2>
                     <div class="border border-gray-700 rounded-lg p-6 mb-6 text-center">
                         <img v-if="state.userMember.avatar_url" :src="state.userMember.avatar_url" alt="头像" class="w-24 h-24 rounded-full object-cover border-4 border-purple-500 shadow-lg mx-auto mb-4">
                         <div v-else class="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center border-4 border-gray-600 mx-auto mb-4">
                             <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-12 h-12 text-gray-400" alt="Default Avatar">
                         </div>
                         <h3 class="text-xl font-bold mb-2">{{ state.userMember.nickname }}</h3>
                         <p class="text-gray-300 mb-4">舞萌ID: <span class="font-mono">{{ state.userMember.maimai_id }}</span></p>
                         <p class="text-gray-300 mb-4">QQ号: {{ state.userMember.qq_number }}</p>
                         <div class="flex justify-center items-center space-x-6 mb-4">
                             <div class="flex items-center">
                                 <span :class="`color-indicator color-${state.userMember.color}-bg mr-2 w-5 h-5`"></span>
                                 <span class="text-lg">{{ getColorText(state.userMember.color) }}</span>
                             </div>
                             <div class="flex items-center">
                                 <img :src="getIconPath('job', state.userMember.job)" class="w-5 h-5 inline-block mr-2 flex-shrink-0" :alt="getJobText(state.userMember.job) + '图标'">
                                 <span class="text-lg">{{ getJobText(state.userMember.job) }}</span>
                             </div>
                         </div>
                         <p class="text-gray-400 text-sm">队伍: {{ state.teamName }} ({{ state.userMember.team_code }})</p>
                         <p class="text-gray-500 text-xs mt-2">加入时间: {{ formatTimestamp(state.userMember.joined_at) }}</p>
                         <p v-if="state.userMember.updated_at" class="text-gray-500 text-xs">更新时间: {{ formatTimestamp(state.userMember.updated_at) }}</p>

                         <div class="mt-6 flex justify-center space-x-4">
                             <button @click="openEditModal" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                 修改信息
                             </button>
                             <button @click="deleteMember" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                 删除报名
                             </button>
                         </div>
                     </div>

                     <!-- Display Team Members (reused from step 1) -->
                     <div v-if="state.teamExists" class="border border-gray-700 rounded-lg p-4">
                         <h3 class="text-xl font-bold mb-2">{{ state.teamName }} ({{ state.teamCode }})</h3>
                         <p class="text-gray-300 text-sm mb-4">队伍成员 ({{ state.teamMembers.length }}/3):</p>
                         <ul class="space-y-2">
                             <li v-for="member in state.teamMembers" :key="member.maimai_id" class="flex items-center text-gray-300 text-sm">
                                 <span :class="`color-indicator color-${member.color}-bg mr-2`"></span>
                                 <img :src="getIconPath('job', member.job)" class="w-4 h-4 inline-block mr-2 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                 {{ member.nickname }} ({{ member.maimai_id }})
                             </li>
                             <li v-if="state.teamMembers.length < 3" class="text-gray-500 text-sm italic">虚位以待...</li>
                         </ul>
                     </div>

                     <div class="mt-6 text-center">
                         <button @click="logout" class="text-gray-400 hover:text-white text-sm">
                             登出
                         </button>
                     </div>

                </div>

                <!-- If user is authenticated but NOT registered -->
                <div v-else-if="state.isAuthenticated && state.kindeUser">
                     <h2 class="text-2xl font-bold text-center mb-6">填写报名信息</h2>
                     <p class="text-gray-300 text-center mb-6">你已登录为 {{ state.kindeUser?.name || state.kindeUser?.email }}。</p>

                     <!-- Registration Form (reused from original IndexPage) -->
                     <form @submit.prevent="submitRegistration">
                         <!-- Team Code (pre-filled from step 1) -->
                         <div class="mb-4">
                             <label for="form-team-code" class="block text-sm font-medium text-purple-300 mb-2">队伍码</label>
                             <input type="text" id="form-team-code" v-model="state.teamCode" disabled class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none opacity-70 cursor-not-allowed">
                         </div>

                         <!-- Color Selection -->
                         <div class="mb-4">
                             <label class="block text-sm font-medium text-purple-300 mb-2">选择颜色 <span class="text-red-500">*</span></label>
                             <div class="flex space-x-4">
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="color" value="red" v-model="state.form.color" required class="form-radio text-red-600 focus:ring-red-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">火</span>
                                 </label>
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="color" value="green" v-model="state.form.color" required class="form-radio text-green-600 focus:ring-green-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">木</span>
                                 </label>
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="color" value="blue" v-model="state.form.color" required class="form-radio text-blue-600 focus:ring-blue-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">水</span>
                                 </label>
                             </div>
                         </div>

                         <!-- Job Selection -->
                         <div class="mb-4">
                             <label class="block text-sm font-medium text-purple-300 mb-2">选择职业 <span class="text-red-500">*</span></label>
                             <div class="flex space-x-4">
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="job" value="attacker" v-model="state.form.job" required class="form-radio text-orange-600 focus:ring-orange-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">绝剑士</span>
                                 </label>
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="job" value="defender" v-model="state.form.job" required class="form-radio text-indigo-600 focus:ring-indigo-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">矩盾手</span>
                                 </label>
                                 <label class="flex items-center cursor-pointer">
                                     <input type="radio" name="job" value="supporter" v-model="state.form.job" required class="form-radio text-pink-600 focus:ring-pink-500 border-gray-500 rounded-full bg-gray-700 outline-none">
                                     <span class="ml-2 text-gray-300">炼星师</span>
                                 </label>
                             </div>
                         </div>

                         <!-- Maimai ID -->
                         <div class="mb-4">
                             <label for="form-maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID <span class="text-red-500">*</span></label>
                             <input type="text" id="form-maimai-id" v-model="state.form.maimaiId" required placeholder="例如：Om1tted" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="13">
                         </div>

                         <!-- Nickname -->
                         <div class="mb-4">
                             <label for="form-nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                             <input type="text" id="form-nickname" v-model="state.form.nickname" required placeholder="例如：om1t" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                         </div>

                         <!-- QQ Number -->
                         <div class="mb-4">
                             <label for="form-qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                             <input type="text" inputmode="numeric" id="form-qq-number" v-model="state.form.qqNumber" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15">
                         </div>

                         <!-- Avatar Upload -->
                         <div class="mb-6 text-center">
                             <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选, 最大 {{ MAX_AVATAR_SIZE_MB }}MB)</label>
                             <div class="flex flex-col items-center space-y-3">
                                 <!-- Preview Image -->
                                 <img v-if="state.form.avatarPreviewUrl" :src="state.form.avatarPreviewUrl" alt="头像预览" class="w-20 h-20 rounded-full object-cover border-2 border-purple-500 shadow-md">
                                 <div v-else class="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                     <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-8 h-8 text-gray-400" alt="Default Avatar">
                                 </div>
                                  <!-- File Input Button -->
                                 <label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                     {{ state.form.avatarFile ? '更换图片' : '选择图片' }}
                                 </label>
                                 <!-- Hidden file input -->
                                 <input type="file" id="avatar-upload" @change="handleAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden">
                                 <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>
                                 <button v-if="state.form.avatarFile" type="button" @click="removeAvatar" class="text-red-400 hover:text-red-600 text-xs mt-1">移除图片</button>
                             </div>
                         </div>

                         <!-- Privacy Agreement -->
                         <div class="mb-6">
                             <label class="flex items-center cursor-pointer">
                                 <input type="checkbox" v-model="state.form.privacyAgreed" required class="form-checkbox text-purple-600 focus:ring-purple-500 border-gray-500 rounded bg-gray-700 outline-none">
                                 <span class="ml-2 text-sm text-gray-300">我已阅读并同意 <a href="#" class="text-purple-400 hover:underline">隐私条款</a> <span class="text-red-500">*</span></span>
                             </label>
                         </div>

                         <!-- Submit Button -->
                         <div class="text-center">
                             <button type="submit" :disabled="state.isLoading || !state.form.privacyAgreed" class="btn-glow bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 px-8 rounded-lg transition duration-300" :class="{'opacity-50 cursor-not-allowed': state.isLoading || !state.form.privacyAgreed}">
                                 {{ state.isLoading ? '提交中...' : '确认报名' }}
                             </button>
                         </div>
                     </form>

                     <div class="mt-6 text-center">
                         <button @click="logout" class="text-gray-400 hover:text-white text-sm">
                             登出
                         </button>
                     </div>

                </div>
                 <!-- If not authenticated (should be handled by step 1 or router guard, but fallback) -->
                 <div v-else class="text-center text-gray-400">
                     请先登录或注册。
                     <button @click="login" class="btn-glow bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg transition duration-300 mt-4">
                         登录 / 注册
                     </button>
                 </div>

            </div>

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8 relative z-10">
                 <p>{{ new Date().getFullYear() }} © NGU Team © MPAM-Lab</p>
            </div>

        </div> <!-- End of Container -->

        <!-- Edit Member Modal (for logged-in user) -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showEditModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4 text-center">修改我的报名信息</h3>

                 <!-- Modal Error Message -->
                 <transition name="fade-in-up">
                     <div v-if="state.editModalErrorMessage" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                         <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                         <span class="break-words flex-grow">{{ state.editModalErrorMessage }}</span>
                        <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.editModalErrorMessage = null" aria-label="关闭错误消息">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                 </transition>

                <form @submit.prevent="saveMemberEdit">
                    <!-- Display static fields -->
                    <div class="mb-4 text-gray-300 text-sm">
                        <p>队伍码: <span class="font-bold">{{ state.userMember?.team_code }}</span></p>
                        <p>舞萌ID: <span class="font-mono font-bold">{{ state.userMember?.maimai_id }}</span></p>
                    </div>

                    <div class="mb-4">
                        <label for="edit-nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="edit-nickname" v-model="state.editForm.nickname" required placeholder="例如：om1t" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                    </div>

                    <div class="mb-4">
                        <label for="edit-qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="edit-qq-number" v-model="state.editForm.qqNumber" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15">
                    </div>

                    <div class="mb-4">
                        <label for="edit-color" class="block text-sm font-medium text-purple-300 mb-2">颜色 <span class="text-red-500">*</span></label>
                        <select id="edit-color" v-model="state.editForm.color" required class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="" disabled>-- 选择颜色 --</option>
                            <option value="red" :disabled="!isColorAvailableInUserTeam('red')" :class="{'opacity-50': !isColorAvailableInUserTeam('red')}">{{ getColorText('red') }}</option>
                            <option value="green" :disabled="!isColorAvailableInUserTeam('green')" :class="{'opacity-50': !isColorAvailableInUserTeam('green')}">{{ getColorText('green') }}</option>
                            <option value="blue" :disabled="!isColorAvailableInUserTeam('blue')" :class="{'opacity-50': !isColorAvailableInUserTeam('blue')}">{{ getColorText('blue') }}</option>
                        </select>
                    </div>

                    <div class="mb-6">
                        <label for="edit-job" class="block text-sm font-medium text-purple-300 mb-2">职业 <span class="text-red-500">*</span></label>
                        <select id="edit-job" v-model="state.editForm.job" required class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="" disabled>-- 选择职业 --</option>
                             <option value="attacker" :disabled="!isJobAvailableInUserTeam('attacker')" :class="{'opacity-50': !isJobAvailableInUserTeam('attacker')}">{{ getJobText('attacker') }}</option>
                            <option value="defender" :disabled="!isJobAvailableInUserTeam('defender')" :class="{'opacity-50': !isJobAvailableInUserTeam('defender')}">{{ getJobText('defender') }}</option>
                            <option value="supporter" :disabled="!isJobAvailableInUserTeam('supporter')" :class="{'opacity-50': !isJobAvailableInUserTeam('supporter')}">{{ getJobText('supporter') }}</option>
                        </select>
                    </div>

                     <!-- Avatar Upload Section in Modal -->
                     <div class="mb-6 text-center">
                         <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选, 最大 {{ MAX_AVATAR_SIZE_MB }}MB)</label>
                         <div class="flex flex-col items-center space-y-3">
                             <!-- Preview Image -->
                             <img v-if="state.editForm.avatarPreviewUrl" :src="state.editForm.avatarPreviewUrl" alt="头像预览" class="w-20 h-20 rounded-full object-cover border-2 border-purple-500 shadow-md">
                             <div v-else class="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                 <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-8 h-8 text-gray-400" alt="Default Avatar">
                             </div>
                              <!-- File Input Button -->
                             <label for="edit-modal-avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                 {{ state.editForm.avatarFile ? '更换图片' : '选择图片' }}
                             </label>
                             <!-- Hidden file input -->
                             <input type="file" id="edit-modal-avatar-upload" @change="handleEditModalAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden">
                             <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>

                             <!-- Option to clear existing avatar -->
                             <label class="flex items-center cursor-pointer text-xs text-gray-300 hover:text-white transition">
                                 <input type="checkbox" v-model="state.editForm.clearAvatarFlag" class="mr-1 h-3 w-3 text-red-600 focus:ring-red-500 border-gray-500 rounded bg-gray-700 outline-none">
                                 移除当前头像
                             </label>
                         </div>
                     </div> <!-- End Avatar Section -->


                    <div class="flex space-x-4 justify-center">
                        <button type="button" @click="closeEditModal" class="flex-1 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium max-w-[100px]">
                            取消
                        </button>
                        <button type="submit" :disabled="state.isSavingEdit" class="flex-1 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium max-w-[180px]" :class="{'opacity-50 cursor-not-allowed': state.isSavingEdit}">
                            {{ state.isSavingEdit ? '保存中...' : '保存更改' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>


    </div> <!-- End of Root Container -->
</template>
<style scoped>
/* Custom styles from previous code */
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

/* Selection Options (Color/Job) */
.color-option, .job-option {
    transition: all 0.2s ease-in-out;
    cursor: pointer;
    border-radius: 1rem; /* Rounded corners for the whole option */
    padding: 10px 5px;
    position: relative; /* For disabled overlay */
    border: 2px solid transparent;
}
.color-option:not(.disabled-option):hover, .job-option:not(:disabled):hover {
    transform: translateY(-4px);
    background-color: rgba(255, 255, 255, 0.05);
}
.color-option.selected, .job-option.selected {
    transform: scale(1.05);
    border-color: #a78bfa; /* Purple border when selected */
     background-color: rgba(167, 139, 250, 0.1);
}
.color-option > div, .job-option > div { /* Style the icon container */
    transition: transform 0.2s ease-in-out;
}
.color-option.selected > div, .job-option.selected > div {
    transform: scale(1.1); /* Slightly larger icon when selected */
}

/* Background gradients for colors */
.color-red-bg { background: linear-gradient(135deg, #ef4444, #dc2626); }
.color-green-bg { background: linear-gradient(135deg, #22c55e, #16a34a); }
.color-blue-bg { background: linear-gradient(135deg, #3b82f6, #2563eb); }
/* Subtle shadows for color options */
.color-red-shadow { box-shadow: 0 6px 12px rgba(220, 38, 38, 0.3); }
.color-green-shadow { box-shadow: 0 6px 12px rgba(22, 163, 74, 0.3); }
.color-blue-shadow { box-shadow: 0 6px 12px rgba(37, 99, 235, 0.3); }

/* Background gradients for jobs */
.job-attacker-bg { background: linear-gradient(135deg, #f97316, #ea580c); } /* Orange */
.job-defender-bg { background: linear-gradient(135deg, #6366f1, #4f46e5); } /* Indigo */
.job-supporter-bg { background: linear-gradient(135deg, #ec4899, #db2777); } /* Pink */
.job-shadow { box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2); }
.job-summary-shadow {box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3); } /* For summary icons */

/* Progress Bar */
.progress-bar {
    height: 6px; /* Slightly thicker */
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}
.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #a78bfa, #8b5cf6);
    border-radius: 3px;
    transition: width 0.5s ease-in-out;
}

/* Disabled Options Styling */
.disabled-option {
    opacity: 0.4;
    cursor: not-allowed;
    position: relative;
}
.disabled-option:hover {
    transform: none;
     background-color: transparent;
}
.disabled-option::after {
    content: "已被选择";
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
     z-index: 10;
}
.disabled-option:hover::after {
    opacity: 1;
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

/* Form Inputs */
.form-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: all 0.3s ease;
    color: white;
}
.form-input:focus {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(167, 139, 250, 0.7);
    box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.3);
    outline: none;
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
  border-radius: 4px;
   vertical-align: middle;
}
input[type="checkbox"]::before {
    content: '';
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 8px;
    height: 8px;
    background-color: white;
    mask: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="20 6 9 17 4 12"%3E%3C/polyline%3E%3C/svg%3E') no-repeat center center;
    mask-size: contain;
    transition: transform 0.2s ease-in-out;
}
input[type="checkbox"]:checked {
  background-color: #8b5cf6;
  border-color: #a78bfa;
}
input[type="checkbox"]:checked::before {
  transform: translate(-50%, -50%) scale(1);
}
input[type="checkbox"]:focus {
  outline: 2px solid #a78bfa;
  outline-offset: 2px;
}
/* Red checkbox for delete confirm */
input[type="checkbox"].text-red-600:checked {
    background-color: #dc2626;
    border-color: #ef4444;
     outline-color: #ef4444;
}
::-webkit-input-placeholder {
    color:    #6b7280;
    opacity: 0.8;
}
:-moz-placeholder {
   color:    #6b7280;
   opacity:  0.8;
}
::-moz-placeholder {
   color:    #6b7280;
   opacity:  0.8;
}
:-ms-input-placeholder {
   color:    #6b7280;
   opacity: 0.8;
}
::-ms-input-placeholder {
   color:    #6b7280;
   opacity: 0.8;
}
::placeholder {
   color:    #6b7280;
   opacity: 0.8;
}

/* SELECT styling */
select.form-input {
    background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="6 9 12 15 18 9"%3E%3Cpolyline%3E%3C/svg%3E');
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    background-size: 1em auto;
    padding-right: 2.5rem;
}

/* Loading Overlay */
.loading-overlay {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.8);
    backdrop-filter: blur(4px);
    z-index: 40;
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
    border-top-color: #a78bfa;
    width: 40px;
    height: 40px;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
}
@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Confetti Styles */
.confetti {
    position: fixed;
    animation-name: confetti-fall;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    z-index: 1;
    border-radius: 2px;
    opacity: 0.8;
    transform: translateY(var(--start-y, -20px)) translateX(var(--start-x, 0)) rotate(var(--start-rotate, 0deg));
}
@keyframes confetti-fall {
    0% {
         opacity: 1;
         transform: translateY(var(--start-y, -20px)) translateX(var(--start-x, 0)) rotate(var(--start-rotate, 0deg)) scale(1);
    }
     100% {
        opacity: 0;
        transform: translateY(105vh) translateX(var(--end-x, 0px)) rotate(var(--end-rotate, 720deg)) scale(0.5);
     }
}
.confetti:nth-child(2n) { animation-timing-function: ease-out; }
.confetti:nth-child(3n) { animation-timing-function: cubic-bezier(0.1, 1, 0.1, 1); }

.celebration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
}

/* QR Code & Share Link */
.qr-code-container {
    background: white;
    padding: 10px;
    border-radius: 12px;
    width: 160px;
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}
.qr-code-container > svg {
    display: block;
    width: 140px;
    height: 140px;
}

.share-link {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: all 0.3s ease;
}
.share-link::selection {
    background-color: #a78bfa;
    color: white;
}

/* Member list avatar border color based on role color */
.border-red-500 { border-color: #ef4444; }
.border-green-500 { border-color: #22c55e; }
.border-blue-500 { border-color: #3b82f6; }

</style>
<!-- 第二个 <style> 块，没有 scoped，用于全局动画 -->
<style>
/* 将动画定义和应用移到这里 */
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
</style>