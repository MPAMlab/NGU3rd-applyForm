<!-- views/index.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef, nextTick } from 'vue';
import QrcodeVue from 'qrcode.vue';
import { useRoute, useRouter } from 'vue-router';
// ADDED: Import Kinde auth composable
import { useKindeAuth } from '../composables/useKindeAuth'; // Ensure this path is correct
// ADDED: Import Settings composable
import { useSettings } from '../composables/useSettings'; // Ensure this path is correct

// Import types from your types file
import { Member, KindeUser } from '../types'; // <--- Ensure this path is correct and Member includes is_admin

// --- Composable Usage ---
const {
    isAuthenticated,
    kindeUser, // { id, email, name } or null
    userMember, // Member object or null (This is now READONLY from the composable)
    login, // Function to initiate login/register
    logout, // Function to initiate logout
    checkAuthStatus, // Function to check auth status and fetch userMember
    authenticatedFetch, // Wrapped fetch function
    updateUserMember, // ADDED: Function to update userMember state via the composable
    handleCallback,
} = useKindeAuth();

// ADDED: Use Settings composable
const {
    isCollectionPaused, // Reactive state for collection status
    isFetchingSettings, // Reactive state for fetching status
    settingsError, // Reactive state for settings errors
    fetchCollectionStatus, // Function to fetch status
    // toggleCollectionStatus is only needed in admin page, not here
} = useSettings();


const route = useRoute();
const router = useRouter();

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
const websiteLink: Ref<string> = ref(import.meta.env.VITE_WEBSITE_LINK || 'http://localhost:5173');
const MAX_AVATAR_SIZE_MB = 2;

// --- State Management (Reactive) ---
interface State {
    currentStep: number;
    teamCode: string | null;
    teamName: string | null;
    isNewTeam: boolean;
    newTeamName: string | null;
    selectedColor: 'red' | 'green' | 'blue' | null;
    selectedJob: 'attacker' | 'defender' | 'supporter' | null;
    maimaiId: string | null;
    nickname: string | null;
    qqNumber: string | null;
    privacyAgreed: boolean;
    avatarFile: File | null;
    avatarPreviewUrl: string | null;
    showEditModal: boolean;
    editMemberId: number | null; // Note: Backend uses maimaiId for PATCH/DELETE, this might be redundant
    editNewNickname: string | null;
    editNewQqNumber: string | null;
    editNewColor: 'red' | 'green' | 'blue' | null;
    editNewJob: 'attacker' | 'defender' | 'supporter' | null;
    editNewAvatarFile: File | null;
    editNewAvatarPreviewUrl: string | null;
    editClearAvatarFlag: boolean;
    showConfirmModal: boolean;
    showCreateModal: boolean;
    showTeamFullInfoModal: boolean; // ADDED: State for Team Full modal
    showLoadingOverlay: boolean; // Global loading for API calls
    errorMessage: string | null; // Global error message
    editModalErrorMessage: string | null; // Error message specifically for the edit modal
    currentTeamMembers: Member[]; // Members fetched for the current team code (used in Step 2, 3, 4, Modals)
    completionAllMembers: Member[]; // Members displayed on the completion page (Step 6)

    confettiInterval: number | null; // Explicitly number | null

    eventInfo: {
        title: string;
        location: string;
        time: string;
        description: string;
    };
}

const state: State = reactive({
    currentStep: 0, // 0: Entry, 1: Auth, 2: Team Code, 3: Color, 4: Job, 5: Personal Info, 6: Completion
    teamCode: null,
    teamName: null,
    isNewTeam: false,
    newTeamName: null,
    selectedColor: null,
    selectedJob: null,
    maimaiId: null,
    nickname: null,
    qqNumber: null,
    privacyAgreed: false,
    avatarFile: null,
    avatarPreviewUrl: null,
    showEditModal: false,
    editMemberId: null,
    editNewNickname: null,
    editNewQqNumber: null,
    editNewColor: null,
    editNewJob: null,
    editNewAvatarFile: null,
    editNewAvatarPreviewUrl: null,
    editClearAvatarFlag: false,
    showConfirmModal: false,
    showCreateModal: false,
    showTeamFullInfoModal: false, // Initialize new state
    showLoadingOverlay: false,
    errorMessage: null,
    editModalErrorMessage: null,
    currentTeamMembers: [],
    completionAllMembers: [],
    confettiInterval: null,

    eventInfo: {
        title: "NGU 3rd 音游娱乐赛",
        location: "翡尔堡家庭娱乐中心(郑州万象城三楼店)",
        time: "2025年6月8日",
        description: "Never ever and ever... 具体规则以及如有变动，请留意群内公告。 官网链接：https://ngu3rd.mpam-lab.xyz",
    }
});

// --- Computed Properties ---
const progressWidth = computed(() => {
    // Map step number directly to percentage based on NEW flow
    const progressMap: { [key: number]: number } = {
        0: 0,   // Entry
        1: 0,   // Auth (Bar starts here, 0%)
        2: 20,  // Team Code
        3: 40,  // Color
        4: 60,  // Job
        5: 80,  // Personal Info
        6: 100  // Completion
    };
    // Get the percentage directly from the map based on the current step
    const percentage = progressMap[state.currentStep] || 0; // Default to 0 if step is unexpected
    return `${percentage}%`;
});

const isColorDisabled = computed(() => (color: 'red' | 'green' | 'blue') => {
     // If editing, the current color is allowed
     if (state.showEditModal && currentUserMember.value) { // Use currentUserMember for edit modal context
         if (currentUserMember.value.color === color) return false;
     }
    // Otherwise, check if any other member in the current team has this color
    // Filter out the current user if they are in the list (relevant for edit modal)
    const membersToCheck = state.currentTeamMembers.filter(m => !(isAuthenticated.value && kindeUser.value && m.kinde_user_id === kindeUser.value.id));
    return membersToCheck.some(member => member.color === color);
});

const isJobDisabled = computed(() => (jobType: 'attacker' | 'defender' | 'supporter') => {
     // If editing, the current job is allowed
     if (state.showEditModal && currentUserMember.value) { // Use currentUserMember for edit modal context
         if (currentUserMember.value.job === jobType) return false;
     }
    // Otherwise, check if any other member in the current team has this job
    // Filter out the current user if they are in the list (relevant for edit modal)
    const membersToCheck = state.currentTeamMembers.filter(m => !(isAuthenticated.value && kindeUser.value && m.kinde_user_id === kindeUser.value.id));
    return membersToCheck.some(member => member.job === jobType);
});


const shareLinkUrl = computed(() => {
    if (!state.teamCode) return '';
    const baseUrl = websiteLink.value.endsWith('/') ? websiteLink.value.slice(0, -1) : websiteLink.value;
    return `${baseUrl}/?code=${state.teamCode}`;
});

// ADDED: Computed property to check if the logged-in user has a member record
const hasUserMember: ComputedRef<boolean> = computed(() => userMember.value !== null);

// ADDED: Computed property to get the logged-in user's member data if it exists
const currentUserMember: ComputedRef<Member | null> = computed(() => userMember.value);


// --- Methods / Functions ---

function showStep(stepNumber: number): void {
    // Clear confetti when leaving the completion step
    if (state.currentStep === 6 && state.confettiInterval !== null) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
        const celebrationDiv = document.getElementById('celebration');
        if(celebrationDiv) celebrationDiv.innerHTML = '';
    }

    state.currentStep = stepNumber;
    state.errorMessage = null; // Clear global error when changing steps
    state.editModalErrorMessage = null; // Clear modal error when changing steps

    // Start confetti when entering the completion step
    if (stepNumber === 6) {
         setTimeout(() => {
             const celebrationDiv = document.getElementById('celebration');
             if(celebrationDiv) celebrationDiv.innerHTML = ''; // Clear previous confetti
             createConfetti();
             state.confettiInterval = setInterval(createConfetti, 2000) as unknown as number; // Explicitly cast to number
         }, 100);
    }
}

async function handleContinue(): Promise<void> {
    // This function is now called from Step 2 (Team Code Input)
    // User is expected to be authenticated at this point.

    // ADDED: Check Collection Status at the start of the flow
    if (isCollectionPaused.value) {
        state.errorMessage = '现在的组队已停止，如需更多信息，请访问官网或咨询管理员。';
        console.log('Collection is paused. Blocking continue.');
        return; // Stop here if collection is paused
    }
    // END ADDED

    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null; // Clear previous errors

    if (code.length !== 4 || isNaN(parseInt(code))) {
        state.errorMessage = '请输入4位数字的组队码。';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ teamCode: code }),
        });

        // ADDED: Handle 403 Forbidden from backend if collection is paused (redundant check, but safe)
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             state.errorMessage = data.error || '操作被拒绝。'; // Use the specific message from backend
             console.log('Backend returned 403, likely due to paused collection.');
             // Stay on Step 2 (Team Code)
             return; // Stop here
        }
        // END ADDED

        // MODIFIED: Handle 404 specifically for creating a new team
        if (response.status === 404) {
            console.log(`Team code ${code} not found. Proceeding to create new team flow.`);
            state.teamCode = code; // Keep the entered code
            state.teamName = null; // Clear any previous team name
            state.currentTeamMembers = []; // Clear members
            state.isNewTeam = true; // Mark as new team
            state.showCreateModal = true; // Show create modal
            // No need to fetch data or check members for a non-existent team
        } else if (!response.ok) { // Handle other non-OK statuses as errors
            const data = await response.json();
            console.error('API error checking team:', response.status, response.statusText, data);
            state.errorMessage = data.error || `检查队伍失败 (${response.status})`;
            // Stay on Step 2 (Team Code)
        } else { // Handle 200 OK response (team found)
            const data = await response.json();
            console.log(`Team code ${code} found. Proceeding to join/view flow.`);
            state.teamCode = data.code;
            state.teamName = data.name;
            state.currentTeamMembers = data.members || [];

             // Check if the logged-in user is already a member of this specific team
             const userIsMember = isAuthenticated.value && userMember.value && state.currentTeamMembers.some(member => member.kinde_user_id === userMember.value?.kinde_user_id);

             if (isAuthenticated.value && userMember.value && userIsMember) { // User is logged in AND is a member of THIS team
                  state.completionAllMembers = state.currentTeamMembers;
                  console.log("User is already a member of this team. Redirecting to completion.");
                  showStep(6); // Go to completion page
             } else if (isAuthenticated.value && userMember.value && !userIsMember) { // User is logged in BUT is a member of ANOTHER team
                  state.errorMessage = '你已经报名参加了其他队伍，一个账号只能报名一次。';
                  // Stay on Step 2 (Team Code)
             }
             else if (state.currentTeamMembers.length >= 3) { // Team is full, and user is NOT a member of THIS team
                  console.log(`Team ${state.teamCode} is full. Showing info modal.`);
                  state.errorMessage = null; // Clear global error, modal shows specific message
                  state.showTeamFullInfoModal = true; // Show the Team Full Info modal
                  // Stay on Step 2 (Team Code)
             }
             else { // Team found, not full, and user is not a member (ready to join)
                  state.isNewTeam = false;
                  state.showConfirmModal = true; // Show confirmation modal before proceeding
                  // Stay on Step 2 (Team Code) until confirmed
             }
        }

    } catch (e: any) { // Catch network errors or errors thrown by the new logic
        console.error('Fetch error checking team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        // Stay on Step 2 (Team Code)
    } finally {
       state.showLoadingOverlay = false; // Hide loading overlay in all cases
    }
}

function confirmJoinTeam(): void {
    // This function is called from the Confirm Join Modal.
    // User is expected to be authenticated and not registered in another team.
    state.showConfirmModal = false; // Close the confirmation modal

    // Proceed to fill personal info (Step 3)
    console.log("User confirmed join. Proceeding to step 3.");
    showStep(3); // Go to Color Selection step
}

async function createNewTeam(): Promise<void> {
    // This function is called from the Create Team Modal.
    // User is expected to be authenticated and not registered in another team.

    // ADDED: Check Collection Status at the start of the flow
    if (isCollectionPaused.value) {
        state.errorMessage = '现在的组队已停止，如需更多信息，请访问官网或咨询管理员。';
        console.log('Collection is paused. Blocking team creation.');
        state.showCreateModal = false; // Close modal
        return; // Stop here if collection is paused
    }
    // END ADDED

    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null; // Clear previous errors

    if (!name || name.trim().length === 0 || name.trim().length > 50) {
        state.errorMessage = '队伍名称不能为空，且不能超过50个字符。';
        return;
    }
     if (!code || code.length !== 4 || isNaN(parseInt(code))) {
         // This validation should ideally be done before showing the modal, but as a safeguard:
         state.errorMessage = '无效的组队码。';
         return;
     }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ teamCode: code, teamName: name.trim() }),
        });

        // ADDED: Handle 403 Forbidden from backend if collection is paused (redundant check, but safe)
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             state.errorMessage = data.error || '操作被拒绝。'; // Use the specific message from backend
             console.log('Backend returned 403, likely due to paused collection.');
             state.showCreateModal = false; // Close modal
             // Stay on Step 2 (Team Code)
             return; // Stop here
        }
        // END ADDED


        const data = await response.json();

        if (!response.ok) {
             console.error('API error creating team:', response.status, data);
             throw new Error(data.error || `创建队伍失败 (${response.status})`);
        }

        console.log("Team created successfully:", data);
        state.teamName = data.name;
        state.currentTeamMembers = []; // New team has no members initially
        state.showCreateModal = false; // Close the create modal

        // After creating the team, the user needs to join it.
        // Proceed to fill personal info (Step 3)
        console.log("User created team. Proceeding to step 3.");
        showStep(3); // Go to Color Selection step


    } catch (e: any) {
        console.error('Fetch error creating team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.showCreateModal = false; // Close modal on error
        // Stay on Step 2 (Team Code) on error
    } finally {
        state.showLoadingOverlay = false; // Hide loading overlay
    }
}

function selectColor(color: 'red' | 'green' | 'blue'): void {
    if (!isColorDisabled.value(color)) {
        state.selectedColor = color;
    }
}

function getColorText(colorId: string | null | undefined): string {
     const map: { [key: string]: string } = { red: '火', green: '木', blue: '水' };
     return map[colorId || ''] || '';
}

function getIconPath(type: 'color' | 'job', value: string | null | undefined): string {
    const paths: { [key: string]: { [key: string]: string } } = {
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
    return paths[type]?.[value || ''] || '';
}

function selectJob(jobId: string): void {
     const jobType = jobId.replace('job-', '') as 'attacker' | 'defender' | 'supporter';
    if (!isJobDisabled.value(jobType)) {
        state.selectedJob = jobType;
    }
}

function getJobText(jobType: string | null | undefined): string {
    const map: { [key: string]: string } = { attacker: '绝剑士', defender: '矩盾手', supporter: '炼星师' };
    return map[jobType || ''] || '';
}

function handleAvatarChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] || null;
    state.errorMessage = null;

    if (!file) {
        clearAvatarFile(); // Use the dedicated clear function
        return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.errorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
        target.value = '';
        state.avatarFile = null;
         return;
    }
    const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
        state.errorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         target.value = '';
         state.avatarFile = null;
        return;
    }

    state.avatarFile = file;

    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
    state.avatarPreviewUrl = URL.createObjectURL(file);
    console.log("Avatar file selected:", file.name, "Preview URL:", state.avatarPreviewUrl);
}

// ADDED: Dedicated function to clear avatar file state
function clearAvatarFile(): void {
    state.avatarFile = null;
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
    state.avatarPreviewUrl = null;
     const avatarInput = document.getElementById('avatar-upload') as HTMLInputElement | null;
     if(avatarInput) avatarInput.value = ''; // Clear file input value
     console.log("Avatar file state cleared.");
}


async function handleSubmitPersonalInfo(): Promise<void> {
    // This function is called from Step 5 (Personal Info)
    // User is expected to be authenticated and not registered yet.

    // ADDED: Check Collection Status at the start of the flow
    if (isCollectionPaused.value) {
        state.errorMessage = '现在的组队已停止，如需更多信息，请访问官网或咨询管理员。';
        console.log('Collection is paused. Blocking submission.');
        state.showLoadingOverlay = false; // Ensure loading is off
        return; // Stop here if collection is paused
    }
    // END ADDED

    state.errorMessage = null;

    // Redundant check as user should be authenticated to reach this step, but kept for safety
    if (!isAuthenticated.value) {
         console.error("Attempted to submit join form while not authenticated.");
         state.errorMessage = '认证状态异常，请尝试重新登录。';
         // Maybe go back to auth step? Or just show error. Staying on step 5 for now.
         state.showLoadingOverlay = false; // Ensure loading is off
         return;
    }
     // Redundant check as user should not have userMember yet, but kept for safety
     if (userMember.value) { // Check userMember.value directly
          console.error("Attempted to submit join form while already registered.");
          state.errorMessage = '你已经报名过了，一个账号只能报名一次。';
          showStep(6); // Go to completion page if already registered
          state.showLoadingOverlay = false; // Ensure loading is off
          return;
     }

    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私政策。';
        return;
    }
    if (!state.selectedColor || !state.selectedJob) {
        state.errorMessage = '内部错误：颜色或职业未选择。请返回上一步。';
        return;
    }
    if (!/^[1-9][0-9]{4,14}$/.test(state.qqNumber.trim())) {
        state.errorMessage = '请输入有效的QQ号码 (5-15位数字, 非0开头)。';
        return;
    }
    if (state.maimaiId.trim().length === 0 || state.maimaiId.trim().length > 13) {
        state.errorMessage = '舞萌ID长度不正确 (应 ≤ 13位)。';
        return;
    }
    if (state.nickname.trim().length === 0 || state.nickname.trim().length > 50) {
        state.errorMessage = '称呼长度需在1到50个字符之间。';
        return;
    }

    // Check color/job availability again (client-side check for better UX)
    // FIX: Changed isColorAvailable.value to isColorDisabled.value
    if (isColorDisabled.value(state.selectedColor!)) { // Use non-null assertion as validation passed
        state.errorMessage = `颜色 '${getColorText(state.selectedColor)}' 在队伍 ${state.teamCode} 中已被占用。`;
        state.showLoadingOverlay = false; // Ensure loading is off
        return;
    }
    // FIX: Changed isJobAvailable.value to isJobDisabled.value
    if (isJobDisabled.value(state.selectedJob!)) { // Use non-null assertion as validation passed
        state.errorMessage = `职业 '${getJobText(state.selectedJob)}' 在队伍 ${state.teamCode} 中已被占用。`;
        state.showLoadingOverlay = false; // Ensure loading is off
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const formData = new FormData();
        formData.append('teamCode', state.teamCode!.trim());
        formData.append('color', state.selectedColor!);
        formData.append('job', state.selectedJob!);
        formData.append('maimaiId', state.maimaiId.trim());
        formData.append('nickname', state.nickname.trim());
        formData.append('qqNumber', state.qqNumber.trim());

        if (state.avatarFile) {
            formData.append('avatarFile', state.avatarFile);
            console.log("Appending avatar file to FormData:", state.avatarFile.name);
        } else {
            console.log("No avatar file selected for join request.");
        }

        const response = await authenticatedFetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            mode: 'cors',
            body: formData,
        });

         // ADDED: Handle 403 Forbidden from backend if collection is paused (redundant check, but safe)
        if (response.status === 403) {
             const data = await response.json().catch(() => ({}));
             state.errorMessage = data.error || '操作被拒绝。'; // Use the specific message from backend
             console.log('Backend returned 403, likely due to paused collection.');
             // Stay on Step 5 (Personal Info) or maybe go back to Step 2? Staying on 5 for now.
             return; // Stop here
        }
        // END ADDED


        const data = await response.json();

        if (!response.ok) {
            console.error('API error joining team:', response.status, data);
             // Handle specific backend errors like team full, already registered, etc.
             if (response.status === 409) { // Conflict
                 state.errorMessage = data.error || '报名信息冲突，请检查组队码、颜色、职业或舞萌ID是否已被占用。';
             } else {
                 state.errorMessage = data.error || `提交报名信息失败 (${response.status})`;
             }
            return; // Stop here on API error
        }

        console.log('Registration successful:', data);

        // Update the userMember state with the newly created member data
        if (data.member) {
            updateUserMember(data.member as Member); // Update the central userMember state
            // The watch on userMember will handle navigation to Step 6
        } else {
            console.warn("Join success response did not include a member object. Re-fetching...");
            // If backend didn't return member, re-fetch auth status to get it
            await checkAuthStatus(); // This will call /members/me and update userMember
            // The watch on userMember will handle navigation to Step 6
        }

        // The watch on userMember becoming non-null will trigger showStep(6)
        // We don't explicitly call showStep(6) here to avoid race conditions with the watch.


    } catch (e: any) {
        console.error('Fetch error joining team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        // Specific error messages are handled above, no need to repeat here
         // authenticatedFetch handles 401 and sets isAuthenticated = false
    } finally {
        state.showLoadingOverlay = false;
    }
}

async function fetchTeamMembers(teamCode: string): Promise<void> {
     if (!teamCode) {
         state.currentTeamMembers = [];
         state.teamName = null;
         return;
     }
     console.log(`Fetching members for team ${teamCode}...`);
     try {
         const response = await fetch(`${API_BASE_URL}/teams/${teamCode}`, {
             method: 'GET',
             mode: 'cors',
         });
         const data = await response.json();
         if (response.ok && data.members) {
             state.currentTeamMembers = data.members as Member[];
             state.teamName = data.name as string;
             console.log(`Fetched ${state.currentTeamMembers.length} members for team ${teamCode}.`);
         } else {
             console.error(`Failed to fetch members for team ${teamCode}:`, response.status, data);
             state.currentTeamMembers = [];
             state.teamName = null;
         }
     } catch (e: any) {
         console.error(`Error fetching members for team ${teamCode}:`, e);
         state.currentTeamMembers = [];
         state.teamName = null;
     }
}


function copyShareLink(): void {
    const urlToCopy = shareLinkUrl.value;
    if (!urlToCopy) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(urlToCopy).then(() => {
            handleCopyFeedback();
        }).catch(err => {
            console.error('Failed to copy using Clipboard API:', err);
            fallbackCopyTextToClipboard(urlToCopy);
        });
    } else {
        fallbackCopyTextToClipboard(urlToCopy);
    }
}

function handleCopyFeedback(): void {
     const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement | null;
     if (copyBtn) {
         const originalIconHTML = copyBtn.innerHTML;
         copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="Copied">';
         copyBtn.disabled = true;
         setTimeout(() => {
             copyBtn.innerHTML = originalIconHTML;
             copyBtn.disabled = false;
         }, 2000);
     }
}

function fallbackCopyTextToClipboard(text: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            console.log('Fallback copying successful!');
            handleCopyFeedback();
        } else {
            console.error('Fallback copying unsuccessful.');
            alert(`复制失败，请手动复制链接：\n${text}`);
        }
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
        alert(`复制失败，请手动复制链接：\n${text}`);
    }

    document.body.removeChild(textarea);
}

function goHome(): void {
    // Clear blob URLs for avatar previews
    if (state.avatarPreviewUrl && state.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
     if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }

    // Reset all relevant state properties
    Object.assign(state, {
        currentStep: 0, // Go back to Entry
        teamCode: null,
        teamName: null,
        isNewTeam: false,
        newTeamName: null,
        selectedColor: null,
        selectedJob: null,
        maimaiId: null,
        nickname: null,
        qqNumber: null,
        privacyAgreed: false,
        avatarFile: null,
        avatarPreviewUrl: null,
        showEditModal: false,
        editMemberId: null,
        editNewNickname: null,
        editNewQqNumber: null,
        editNewColor: null,
        editNewJob: null,
        editNewAvatarFile: null,
        editNewAvatarPreviewUrl: null,
        editClearAvatarFlag: false,
        showConfirmModal: false,
        showCreateModal: false,
        showTeamFullInfoModal: false, // Reset new modal state
        showLoadingOverlay: false,
        errorMessage: null, // Clear global error
        editModalErrorMessage: null, // Clear modal error
        currentTeamMembers: [],
        completionAllMembers: [],
        confettiInterval: null, // Clear confetti interval
    });

    // Clear confetti elements from DOM
    const celebrationDiv = document.getElementById('celebration');
    if(celebrationDiv) celebrationDiv.innerHTML = '';

    // Clean up URL params if not a share link (share link has 'code')
    // Kinde callback params ('code', 'state') are handled and cleared by handleCallback/router.replace
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('code')) { // Only clear if no 'code' param (which might be a share link)
        history.replaceState(null, '', window.location.pathname);
    }

    // Re-check auth status to determine if user is logged in or not for the initial step 0 display
    // This is done implicitly by the watch on isAuthenticated/userMember after checkAuthStatus runs on mount.
    // No need to explicitly call checkAuthStatus here again, as it runs on mount.
}

function createConfetti(): void {
    const celebrationDiv = document.getElementById('celebration');
    if (!celebrationDiv) return;
    const confettiCount = 20;
    const colors = ['#ff5f6d', '#00b09b', '#4facfe', '#a78bfa', '#fcd34d', '#ff9a9e', '#fad0c4', '#a1c4fd', '#c2e9fb', '#d4fc79'];

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = randomColor;
        const startX = Math.random() * 120 - 10;
        confetti.style.left = startX + 'vw';
        const startY = -10 - (Math.random() * 20);
        confetti.style.top = startY + 'vh';
        const size = Math.random() * 10 + 5;
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';
        const duration = Math.random() * 4 + 2;
        confetti.style.animationDuration = duration + 's';
        const delay = Math.random() * 3;
        confetti.style.animationDelay = delay + 's';
         const startRotate = Math.random() * 360;
         const endRotate = startRotate + (Math.random() > 0.5 ? 720 : -720);
         confetti.style.setProperty('--start-rotate', `${startRotate}deg`);
         confetti.style.setProperty('--end-rotate', `${endRotate}deg`);
         confetti.style.setProperty('--end-y', '105vh');
        celebrationDiv.appendChild(confetti);
        // Remove element after animation ends (or a bit after delay + duration)
        setTimeout(() => confetti.remove(), (duration + delay) * 1000 + 500);
    }
}

function openEditModalForUser(): void {
   if (!currentUserMember.value) {
       console.error("Attempted to open edit modal, but userMember is null.");
       state.errorMessage = "无法找到你的报名信息进行修改。";
       return;
   }
   const member = currentUserMember.value;
   state.editMemberId = member.id; // Store ID for reference, though API uses maimaiId
   state.editNewNickname = member.nickname;
   state.editNewQqNumber = member.qq_number;
   state.editNewColor = member.color;
   state.editNewJob = member.job;
   if (member.avatar_url) {
        state.editNewAvatarPreviewUrl = member.avatar_url;
   } else {
        state.editNewAvatarPreviewUrl = null;
   }
   state.editNewAvatarFile = null; // No new file selected initially
   state.editClearAvatarFlag = false; // Not checked initially
   state.errorMessage = null; // Clear global error
   state.editModalErrorMessage = null; // Clear modal error
   state.showEditModal = true; // Show the modal
   console.log("Edit modal opened for user member ID:", state.editMemberId);
}

function closeEditModal(): void {
   console.log("Closing edit modal.");
   state.showEditModal = false;
   state.errorMessage = null; // Clear global error
   state.editModalErrorMessage = null; // Clear modal error
   // Clean up blob URL if it exists
    if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
    }
    // Reset modal form state
    state.editMemberId = null;
    state.editNewNickname = null;
    state.editNewQqNumber = null;
    state.editNewColor = null;
    state.editNewJob = null;
    state.editNewAvatarFile = null;
    state.editNewAvatarPreviewUrl = null;
    state.editClearAvatarFlag = false;
}

function handleEditAvatarChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] || null;
    state.errorMessage = null; // Clear global error
    state.editModalErrorMessage = null; // Clear modal error

    if (!file) {
        clearEditAvatarFile(); // Use the dedicated clear function
        return;
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
     if (!allowedTypes.includes(file.type)) {
         state.editModalErrorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
         target.value = '';
         state.editNewAvatarFile = null;
         return;
     }
     const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
     if (file.size > sizeLimitBytes) {
         state.editModalErrorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         target.value = '';
         state.editNewAvatarFile = null;
         return;
     }
    state.editNewAvatarFile = file;
     if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }
     state.editNewAvatarPreviewUrl = URL.createObjectURL(file);
     console.log("Edit modal: Avatar file selected:", file.name, "Preview URL:", state.editNewAvatarPreviewUrl);
     state.editClearAvatarFlag = false; // If a new file is selected, cancel the "clear avatar" flag
}

// ADDED: Dedicated function to clear edit avatar file state (reverts to current or no avatar)
function clearEditAvatarFile(): void {
    state.editNewAvatarFile = null;
     if (currentUserMember.value?.avatar_url) {
         state.editNewAvatarPreviewUrl = currentUserMember.value.avatar_url; // Revert preview to current avatar if exists
     } else if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        state.editNewAvatarPreviewUrl = null; // Clear blob URL if no current avatar
     } else {
         state.editNewAvatarPreviewUrl = null; // Ensure null if no current avatar and no blob
     }
    state.editClearAvatarFlag = false; // Clearing the *new* file doesn't mean clearing the *existing* one
     const editAvatarInput = document.getElementById('edit-avatar-upload') as HTMLInputElement | null;
     if(editAvatarInput) editAvatarInput.value = ''; // Clear file input value
     console.log("Edit modal: New avatar file state cleared.");
}

// MODIFIED: Function to remove the *existing* avatar
function removeEditAvatar(): void {
    state.editNewAvatarFile = null; // Clear any newly selected file
    if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
    }
    state.editNewAvatarPreviewUrl = null; // Clear the preview
     const editAvatarInput = document.getElementById('edit-avatar-upload') as HTMLInputElement | null;
     if(editAvatarInput) editAvatarInput.value = ''; // Clear file input value
     state.editClearAvatarFlag = true; // Set flag to tell backend to remove existing avatar
     console.log("Edit modal: Existing avatar marked for removal.");
}


async function saveChanges(): Promise<void> {
    state.errorMessage = null; // Clear global error
    state.editModalErrorMessage = null; // Clear modal error

    if (!currentUserMember.value) { // Use currentUserMember directly
         console.error("Attempted to save changes, but currentUserMember is missing.");
         state.editModalErrorMessage = "无法找到你的报名信息进行修改。";
         return;
    }

     // Validation for fields that can be changed
     // Only validate if the field is NOT null (meaning user interacted with it)
     if (state.editNewNickname !== null && (state.editNewNickname.trim().length === 0 || state.editNewNickname.trim().length > 50)) {
          state.editModalErrorMessage = '新称呼长度需在1到50个字符之间。';
          return;
      }
     if (state.editNewQqNumber !== null && !/^[1-9][0-9]{4,14}$/.test(state.editNewQqNumber.trim())) {
         state.editModalErrorMessage = '请输入有效的QQ号码（修改）。';
         return;
     }
      // Color and Job validation is implicitly done by the select options being disabled
      // Also check if the *selected* new color/job is now disabled (could happen if another member updates)
      if (state.editNewColor !== null && state.editNewColor !== currentUserMember.value.color && isColorDisabled.value(state.editNewColor)) {
           state.editModalErrorMessage = `选择的元素 '${getColorText(state.editNewColor)}' 已被队伍其他成员占用。`;
           return;
      }
      if (state.editNewJob !== null && state.editNewJob !== currentUserMember.value.job && isJobDisabled.value(state.editNewJob)) {
           state.editModalErrorMessage = `选择的职业 '${getJobText(state.editNewJob)}' 已被队伍其他成员占用。`;
           return;
      }


    // Check if any changes were actually made
    const originalMember = currentUserMember.value;
    const isNicknameChanged = state.editNewNickname !== null && state.editNewNickname.trim() !== originalMember.nickname;
    const isQqChanged = state.editNewQqNumber !== null && state.editNewQqNumber.trim() !== originalMember.qq_number;
    const isColorChanged = state.editNewColor !== null && state.editNewColor !== originalMember.color;
    const isJobChanged = state.editNewJob !== null && state.editNewJob !== originalMember.job;
    const isAvatarChanged = state.editNewAvatarFile !== null || state.editClearAvatarFlag;

    if (!isNicknameChanged && !isQqChanged && !isColorChanged && !isJobChanged && !isAvatarChanged) {
        state.editModalErrorMessage = '没有检测到任何修改。';
        setTimeout(() => { state.editModalErrorMessage = null; }, 2000);
        return;
    }

    state.showLoadingOverlay = true; // Use global loading
    try {
        const formData = new FormData();
         // Only append fields that have changed or are explicitly being cleared (avatar)
         if (isNicknameChanged) {
             formData.append('nickname', state.editNewNickname!.trim());
         }
         if (isQqChanged) {
             formData.append('qqNumber', state.editNewQqNumber!.trim());
         }
         if (isColorChanged) {
             formData.append('color', state.editNewColor!);
         }
         if (isJobChanged) {
             formData.append('job', state.editNewJob!);
         }

        if (state.editNewAvatarFile) {
            formData.append('avatarFile', state.editNewAvatarFile);
            formData.append('clearAvatar', 'false'); // New file overrides clear
             console.log("Appending new avatar file for update.");
         } else if (state.editClearAvatarFlag) {
            formData.append('clearAvatar', 'true'); // Explicitly clear existing avatar
             console.log("Appending clearAvatar=true for update.");
         } else {
             // If no new file and clearAvatarFlag is false, explicitly tell backend not to change avatar
             formData.append('clearAvatar', 'false');
             console.log("Appending clearAvatar=false (no avatar change).");
         }

        const targetMaimaiId = currentUserMember.value.maimai_id;
        if (!targetMaimaiId) {
             throw new Error("无法获取当前用户的舞萌ID进行修改。");
        }
        console.log("Sending PATCH request to:", `${API_BASE_URL}/members/${targetMaimaiId}`);
         const response = await authenticatedFetch(`${API_BASE_URL}/members/${targetMaimaiId}`, {
             method: 'PATCH',
             mode: 'cors',
             body: formData,
         });
        const data = await response.json();
        if (!response.ok) {
             console.error('API error saving changes:', response.status, data);
             let errorMsg = data.error || `保存修改失败 (${response.status})`;
             if (data.error?.includes('Authorization failed')) {
                 errorMsg = '认证失败，请重新登录。';
                 logout(); // Log out if auth fails
             } else if (data.error?.includes('already taken')) {
                 errorMsg = '选择的元素/职业已被队伍其他成员占用。';
             } else if (data.error?.includes('not found')) {
                 errorMsg = '未找到你的报名信息。';
             }
             throw new Error(errorMsg);
        }
        console.log('Changes saved successfully:', data);
        state.editModalErrorMessage = '信息更新成功！'; // Show success message in modal

         if (data.member) {
             // MODIFIED: Use the composable's update function
             updateUserMember(data.member as Member);
             // Re-fetch team members to update the list displayed on Step 6
             await fetchTeamMembers(state.teamCode!);
             state.completionAllMembers = state.currentTeamMembers; // Update completion list
         } else {
              console.warn("PATCH success response did not include an updated member object. Re-fetching...");
              // MODIFIED: Rely on checkAuthStatus to update userMember
              await checkAuthStatus(); // This will re-fetch userMember
              await fetchTeamMembers(state.teamCode!); // Re-fetch team members to update list
              state.completionAllMembers = state.currentTeamMembers; // Update completion list
         }

         // Close modal after a short delay to show success message
         setTimeout(() => {
             closeEditModal();
             state.errorMessage = null; // Clear global error if any
         }, 1500);

    } catch (e: any) {
        console.error('Fetch error saving changes:', e);
        state.editModalErrorMessage = e.message || '保存修改失败，请稍后再试。'; // Show error in modal
    } finally {
        state.showLoadingOverlay = false; // Hide global loading
    }
}

async function deleteEntry(): Promise<void> {
     state.errorMessage = null; // Clear global error
     state.editModalErrorMessage = null; // Clear modal error

    if (!currentUserMember.value) { // Use currentUserMember directly
         console.error("Attempted to delete, but currentUserMember is missing.");
         state.editModalErrorMessage = "无法找到你的报名信息进行删除。";
         return;
    }

    if (!window.confirm(`确定要删除你的报名信息吗？此操作无法撤销！`)) {
        console.log("Delete cancelled by user via confirm dialog.");
        return;
    }
    state.showLoadingOverlay = true; // Use global loading
    try {
         const targetMaimaiId = currentUserMember.value.maimai_id;
         if (!targetMaimaiId) {
             throw new Error("无法获取当前用户的舞萌ID进行删除。");
         }
         console.log("Sending DELETE request to:", `${API_BASE_URL}/members/${targetMaimaiId}`);
         const response = await authenticatedFetch(`${API_BASE_URL}/members/${targetMaimaiId}`, {
             method: 'DELETE',
             headers: { 'Content-Type': 'application/json' },
             mode: 'cors',
         });

         if (response.status === 204 || response.ok) { // Handle 204 No Content or other 2xx
             console.log('Deletion successful.');
             state.errorMessage = '报名信息已成功删除！'; // Show success message globally

             // MODIFIED: Use the composable's update function
             updateUserMember(null); // Clear the central userMember state

             // The watch on userMember becoming null will handle navigation to Step 0 (Home)
             // and clearing local state.
             closeEditModal(); // Close the edit modal immediately

         } else {
             const data = await response.json();
             console.error('API error deleting entry:', response.status, data);
             let errorMsg = data.error || `删除信息失败 (${response.status})`;
             if (data.error?.includes('Authorization failed')) {
                 errorMsg = '认证失败，请重新登录。';
                 logout(); // Log out if auth fails
             } else if (data.error?.includes('not found')) {
                  errorMsg = '未找到匹配的报名信息。';
             }
            throw new Error(errorMsg);
         }
    } catch (e: any) {
        console.error('Fetch error deleting entry:', e);
         state.editModalErrorMessage = e.message || '删除失败，请稍后再试。'; // Show error in modal
    } finally {
        state.showLoadingOverlay = false; // Hide global loading
    }
}


function createTriangleBackground(): void {
    const trianglesContainer = document.getElementById('triangles');
    if (!trianglesContainer) return;

    const colors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'];
    const triangleCount = 50;

    for (let i = 0; i < triangleCount; i++) {
        const triangle = document.createElement('div');
        triangle.classList.add('triangle');

        const size = Math.random() * 100 + 50;

        const left = Math.random() * 100;
        const top = Math.random() * 100 + 100; // Start below the viewport

        const color = colors[Math.floor(Math.random() * colors.length)];

        const duration = Math.random() * 30 + 20; // Longer duration
        const delay = Math.random() * 30; // Random delay

        triangle.style.borderLeft = `${size / 2}px solid transparent`;
        triangle.style.borderRight = `${size / 2}px solid transparent`;
        triangle.style.borderBottom = `${size}px solid ${color}`;
        triangle.style.left = `${left}%`;
        triangle.style.top = `${top}vh`; // Use vh for initial position
        triangle.style.animationDuration = `${duration}s`;
        triangle.style.animationDelay = `${delay}s`;
         const startRotate = Math.random() * 360;
         const endRotate = startRotate + (Math.random() > 0.5 ? 720 : -720);
         triangle.style.setProperty('--start-rotate', `${startRotate}deg`);
         triangle.style.setProperty('--end-rotate', `${endRotate}deg`);
         triangle.style.setProperty('--end-y', '-105vh'); // End above the viewport
        trianglesContainer.appendChild(triangle);
        // Remove element after animation ends (or a bit after delay + duration)
        setTimeout(() => triangle.remove(), (duration + delay) * 1000 + 500);
    }
}

// In the template, change @click="login('login')" to @click="initiateLogin('login')"
// and @click="login('create')" to @click="initiateLogin('create')"
// In src/views/index.vue, around line 1138-1141
function initiateLogin(prompt: 'login' | 'create'): void {
    // Pass the current teamCode and step as context to satisfy the login function's type requirement.
    // state.teamCode might be null at this step in the new flow, which is acceptable by the type.
    login(prompt, { teamCode: state.teamCode, currentStep: state.currentStep });
}

// --- Lifecycle Hooks ---

onMounted(async () => {
    console.log("onMounted: Starting auth status check...");
    // Check auth status first. This populates isAuthenticated and userMember.
    await checkAuthStatus();
    console.log("onMounted: checkAuthStatus completed. isAuthenticated =", isAuthenticated.value, "userMember =", userMember.value);

    // ADDED: Fetch Collection Status on Mount
    console.log("onMounted: Fetching collection status...");
    await fetchCollectionStatus(); // Call the fetch function from the composable
    console.log("onMounted: Collection paused status:", isCollectionPaused.value);
    // END ADDED

    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    const stateParam = urlParams.get('state'); // Get state param for callback

    // Handle Kinde callback redirect
    if (codeParam && stateParam) {
        console.log("onMounted: Found code and state params, handling Kinde callback...");
        state.showLoadingOverlay = true; // Show loading while handling callback
        const callbackResult = await handleCallback(codeParam, stateParam);
        state.showLoadingOverlay = false;

        // Clear URL parameters after handling
        // Use router.replace to change URL without adding to history
        router.replace({ query: {} });

        if (callbackResult.success) {
            console.log("Callback handled successfully.");
            // After successful callback, checkAuthStatus has been run,
            // isAuthenticated and userMember are updated.
            // The watch on userMember will now handle navigation.
            // If userMember is not null, watch will go to Step 6.
            // If userMember is null (shouldn't happen after successful login/register),
            // we should go to Step 1 (Auth Prompt) or Step 2 (Team Code) depending on context?
            // Let's rely on the watch for userMember becoming non-null to go to Step 6.
            // If userMember is still null after callback (error?), go to Step 1.
             if (userMember.value) {
                 // Watch will handle navigation to Step 6
                 console.log("Callback success, userMember exists. Watch will navigate to Step 6.");
             } else {
                 console.warn("Callback success, but userMember is null. Navigating to Step 1.");
                 showStep(1); // Go to Auth Prompt (should show logged-in state)
             }

        } else {
            console.error("Callback handling failed:", callbackResult.error);
            state.errorMessage = callbackResult.error;
            showStep(1); // Go back to Auth Prompt on failure
        }
    }
    // Initial load (not a callback)
    else {
        // If user is authenticated AND has a member record (determined by checkAuthStatus)
        if (isAuthenticated.value && userMember.value) { // Use userMember.value directly
            console.log("onMounted: User is authenticated and registered. Showing step 6.");
            // The userMember state is already populated by checkAuthStatus -> fetchUserMember
            state.teamCode = userMember.value!.team_code; // Use the team code from the fetched member
            // We already have the user's member data, but we need *all* team members for display
            await fetchTeamMembers(state.teamCode); // Fetch all members for the team
            state.completionAllMembers = state.currentTeamMembers; // Update completion list
            showStep(6); // Go directly to completion page
        }
        // If user is authenticated but has NO member record yet
        else if (isAuthenticated.value && !userMember.value) { // Use userMember.value directly
            console.log("onMounted: User is authenticated but not registered. Showing step 1 (Auth Prompt).");
            // User is logged in but not registered. Show the auth prompt (which will show "You are logged in").
            showStep(1);
        }
        // If none of the above, the user is not authenticated
        else {
           console.log("onMounted: User is not authenticated. Showing entry page.");
           showStep(0); // Show the initial entry page
        }

         // If there's a team code in the URL on initial load (e.g., shared link)
         // This check should happen AFTER determining the user's auth/registration status
         // If user is NOT registered, and a code is present, we can pre-fill it in Step 2.
         const initialCodeParam = urlParams.get('code');
         if (initialCodeParam && initialCodeParam.length === 4 && !isNaN(parseInt(initialCodeParam)) && !userMember.value) {
             console.log("onMounted: Found initial code param and user is not registered. Pre-filling code.");
             state.teamCode = initialCodeParam;
             // User will land on Step 1 (Auth) or Step 0 (Entry).
             // If they proceed through auth and land on Step 2 (Team Code), the code will be pre-filled.
         }
    }

    createTriangleBackground();
});

onUnmounted(() => {
    // Clear confetti interval and elements
    if (state.confettiInterval !== null) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
    // Clear blob URLs for avatar previews
    if (state.avatarPreviewUrl && state.avatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
     if (state.editNewAvatarPreviewUrl && state.editNewAvatarPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
    }
    // Clear background triangles
    const trianglesContainer = document.getElementById('triangles');
    if (trianglesContainer) {
        trianglesContainer.innerHTML = '';
    }
});

// Watch for changes in userMember state
watch(userMember, async (newValue, oldValue) => {
    console.log("userMember state changed:", oldValue ? 'exists' : 'null', "->", newValue ? 'exists' : 'null');
    // If userMember was not null and becomes null (e.g., after deletion OR logout)
    if (oldValue !== null && newValue === null) {
        console.log("User member became null. Going home.");
        // Go home resets state and checks auth, landing on Step 0
        goHome();
        // state.errorMessage is handled by watch(isAuthenticated) on logout
        // If deletion happened while on Step 6, goHome handles it.
        // If deletion happened via modal on another step, goHome handles it.
    }
    // If userMember becomes non-null (user just registered or logged in and is registered)
    if (oldValue === null && newValue !== null) {
        console.log("User member became non-null. User is now registered. Navigating to Step 6.");
        // User is now registered. Navigate to the completion page.
        state.teamCode = newValue.team_code; // Ensure teamCode is set from the new member data
        await fetchTeamMembers(state.teamCode!); // Fetch all members for the team
        state.completionAllMembers = state.currentTeamMembers; // Update completion list
        showStep(6); // Go to completion page
        nextTick(() => { // Scroll to the completion step
            const completionDiv = document.getElementById('step-completion');
            if (completionDiv) {
                completionDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                 window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
});

// Watch for changes in isAuthenticated state
watch(isAuthenticated, (newValue, oldValue) => {
    console.log("isAuthenticated state changed:", oldValue, "->", newValue);
    if (newValue === false && oldValue === true) {
        console.log("User logged out.");
        // Go home resets state and lands on Step 0
        goHome();
        state.errorMessage = '您已退出登录。'; // Show logout message
        setTimeout(() => { state.errorMessage = null; }, 3000); // Clear message
    }
    // If isAuthenticated becomes true, the watch on userMember will handle navigation if they are registered.
    // If they are not registered, they will land on Step 1 (Auth Prompt) via onMounted logic.
});

// ADDED: Watch for changes in isCollectionPaused to potentially show a message
watch(isCollectionPaused, (newValue) => {
    console.log("Collection paused status changed:", newValue);
    // Only show the specific message if collection is paused and we are not on the completion page
    // (Completion page shows the final state, not the ability to join/create)
    if (newValue === true && state.currentStep !== 6) {
        state.errorMessage = '现在的组队已停止，如需更多信息，请访问官网或咨询管理员。';
    } else if (newValue === false && state.errorMessage === '现在的组队已停止，如需更多信息，请访问官网或咨询管理员。') {
        // Clear the specific message if collection becomes active again AND that specific message is currently shown
        state.errorMessage = null;
    }
});


// Assuming createTriangleBackground is a separate function for visual effects
// function createTriangleBackground() { ... }

</script>

<template>
    <!-- Root container -->
    <div class="bg-gray-900 text-white min-h-screen flex flex-col overflow-y-auto items-center justify-center px-4 py-8 sm:px-6 lg:px-8 relative">
         <!-- 动态三角形背景 -->
         <div id="triangles" class="absolute inset-0 z-0 overflow-hidden"></div>
        <!-- Main Content Container -->
        <div class="w-full max-w-md mx-auto relative z-10">

            <!-- Progress Bar (Visible from step 1 onwards) -->
            <div class="mb-8" v-if="state.currentStep >= 1"> <!-- Show from step 1 onwards -->
                <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
                    <!-- Updated labels for new flow -->
                    <span :class="{'text-white font-bold': state.currentStep >= 1}">登录/注册</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 2}">组队码</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 3}">元素</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 4}">职业</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 5}">个人信息</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 6}">完成</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: progressWidth }"></div>
                </div>
            </div>

             <!-- Global Error message display area -->
             <transition name="fade-in-up">
                 <div v-if="state.errorMessage && (!state.showConfirmModal && !state.showCreateModal && !state.showEditModal && !state.showTeamFullInfoModal && !state.showLoadingOverlay)" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                     <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                     <span class="break-words flex-grow">{{ state.errorMessage }}</span>
                    <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.errorMessage = null" aria-label="关闭错误消息">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
             </transition>

            <!-- Step 0: Entry Page -->
            <div id="step-entry" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 0">
                <!-- Header -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <img src="/logo.webp" class="w-24 h-24 text-white" alt="NGU3rd Logo">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">{{ state.eventInfo.title }}</h1>
                    <p class="text-purple-300">活动报名入口</p>
                </div>

                <!-- Event Information -->
                <div class="mb-8 space-y-4 text-sm">
                    <div class="flex items-start">
                        <img src="https://unpkg.com/lucide-static@latest/icons/map-pin.svg" class="w-4 h-4 mr-3 text-purple-300 flex-shrink-0 mt-1" alt="Location">
                        <span class="text-gray-200"><strong class="font-medium text-purple-300">地点:</strong> {{ state.eventInfo.location }}</span>
                    </div>
                    <div class="flex items-start">
                        <img src="https://unpkg.com/lucide-static@latest/icons/clock.svg" class="w-4 h-4 mr-3 text-purple-300 flex-shrink-0 mt-1" alt="Time">
                        <span class="text-gray-200"><strong class="font-medium text-purple-300">时间:</strong> {{ state.eventInfo.time }}</span>
                    </div>
                    <div class="flex items-start">
                         <img src="https://unpkg.com/lucide-static@latest/icons/info.svg" class="w-4 h-4 mr-3 text-purple-300 flex-shrink-0 mt-1" alt="Info">
                        <p class="text-gray-300 leading-relaxed"><strong class="font-medium text-purple-300">简介:</strong> {{ state.eventInfo.description }}</p>
                    </div>
                </div>

                 <!-- ADDED: Message if collection is paused -->
                 <div v-if="isCollectionPaused" class="text-center text-yellow-400 mb-6 font-bold">
                     <p>报名收集已暂停。</p>
                 </div>
                 <!-- END ADDED -->

                <!-- Enter Button -->
                <!-- Navigate to Step 1 (Auth Prompt) -->
                <button @click="showStep(1)" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300" :disabled="isCollectionPaused">
                    进入报名 / 组队
                </button>
            </div>

            <!-- Step 1: Login/Register Prompt (Moved from old Step 2) -->
            <div id="step-auth-prompt" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 1">
                 <!-- Header -->
                 <div class="text-center mb-8">
                     <div class="w-24 h-24 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://unpkg.com/lucide-static@latest/icons/log-in.svg" class="w-12 h-12 text-white" alt="Auth">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">登录或注册</h1>
                    <p class="text-cyan-300">请选择登录或者注册新账号以继续报名</p>
                    <p class="text-cyan-300 text-sm">账号系统使用一个第三方的登录集成服务 Kinde 并收集必要的个人信息</p>
                </div>

                 <!-- ADDED: Message if collection is paused -->
                 <div v-if="isCollectionPaused" class="text-center text-yellow-400 mb-6 font-bold">
                     <p>报名收集已暂停。</p>
                 </div>
                 <!-- END ADDED -->

                 <!-- Conditional content based on auth/member status -->
                 <div v-if="isAuthenticated && hasUserMember" class="text-center mb-6">
                     <p class="text-lg text-green-400 font-semibold mb-2">你已登录并已报名！</p>
                     <p class="text-gray-300 text-sm">你的报名信息已关联到你的 Kinde 账号。</p>
                     <!-- Navigate to Step 6 (Completion) -->
                     <button @click="showStep(6)" class="mt-4 bg-green-700 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition">查看我的报名信息</button>
                 </div>
                 <div v-else-if="isAuthenticated && !hasUserMember" class="text-center mb-6">
                     <p class="text-lg text-yellow-400 font-semibold mb-2">你已登录！</p>
                     <p class="text-gray-300 text-sm">请继续完成报名信息填写。</p>
                     <!-- Navigate to Step 2 (Team Code) -->
                     <button @click="showStep(2)" class="mt-4 bg-yellow-700 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg transition" :disabled="isCollectionPaused">继续报名</button>
                 </div>
                 <div v-else class="text-center mb-6">
                    <p class="text-gray-300 text-sm mb-4">请选择登录或注册方式：</p>
                    <!-- Call initiateLogin -->
                    <button @click="initiateLogin('login')" class="btn-glow w-full bg-blue-700 hover:bg-blue-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :disabled="isCollectionPaused">
                        登录
                    </button>
                    <!-- Call initiateLogin -->
                    <button @click="initiateLogin('create')" class="btn-glow w-full bg-teal-700 hover:bg-teal-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :disabled="isCollectionPaused">
                        注册新账号
                    </button>
                </div>

                 <!-- Navigate back to Step 0 (Entry) -->
                 <button type="button" @click="showStep(0)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回活动信息
                </button>
            </div>


            <!-- Step 2: Team Code Input (Moved from old Step 1) -->
            <div id="step-team-code" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 2">
                <!-- Header -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-12 h-12 text-white" alt="Team">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">加入或创建队伍</h1>
                    <p class="text-purple-300">输入四位数组队码</p>
                </div>

                <!-- Input Field -->
                <div class="mb-8">
                    <label for="teamCode" class="block text-sm font-medium text-purple-300 mb-2">组队码</label>
                    <input
                        type="text"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        id="teamCode"
                        v-model="state.teamCode"
                        maxlength="4"
                        placeholder="1234"
                        class="input-code w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-4 px-6 text-2xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center tracking-[0.5em]"
                        @input="(event) => state.teamCode = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '')"
                        @keydown.enter="handleContinue()"
                        :disabled="state.showLoadingOverlay || isCollectionPaused"
                    >
                    <p class="mt-2 text-xs text-gray-400">不存在的组队码将自动创建新队伍</p>
                </div>

                 <!-- ADDED: Message if collection is paused -->
                 <div v-if="isCollectionPaused" class="text-center text-yellow-400 mb-6 font-bold">
                     <p>报名收集已暂停。</p>
                 </div>
                 <!-- END ADDED -->

                <!-- Continue Button -->
                <button @click="handleContinue()" :disabled="state.showLoadingOverlay || isCollectionPaused" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :class="{'opacity-50 cursor-not-allowed': state.showLoadingOverlay || isCollectionPaused}">
                    {{ state.showLoadingOverlay ? '检查中...' : '继续' }}
                </button>
                 <!-- Navigate back to Step 1 (Auth Prompt) -->
                 <button type="button" @click="showStep(1)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- Step 3: Color Selection (Step number remains 3) -->
            <div id="step-color-selection" class="glass rounded-3xl p-4 sm:p-6 md:p-8 fade-in" v-if="state.currentStep === 3">
                <!-- Header -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的元素</h1>
                    <p class="text-purple-300">每个队伍中的元素必须唯一</p>
                </div>

                <!-- Team Info Box -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                     <div class="flex items-center">
                         <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md flex-shrink-0">
                             <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                        </div>
                        <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                             <p class="text-xs text-gray-400">{{ state.teamCode || '----' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                        </div>
                    </div>
                </div>

                <!-- Color Options Grid -->
                <div class="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-8">
                    <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'red', 'disabled-option': isColorDisabled('red') }"
                         @click="selectColor('red')" @keydown.enter="selectColor('red')" @keydown.space="selectColor('red')">
                        <div class="color-red-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center color-red-shadow">
                             <img :src="getIconPath('color', 'red')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getColorText('red') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('red') }}</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'green', 'disabled-option': isColorDisabled('green') }"
                         @click="selectColor('green')" @keydown.enter="selectColor('green')" @keydown.space="selectColor('green')">
                        <div class="color-green-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center color-green-shadow">
                             <img :src="getIconPath('color', 'green')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getColorText('green') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('green') }}</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'blue', 'disabled-option': isColorDisabled('blue') }"
                         @click="selectColor('blue')" @keydown.enter="selectColor('blue')" @keydown.space="selectColor('blue')">
                        <div class="color-blue-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center color-blue-shadow">
                             <img :src="getIconPath('color', 'blue')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getColorText('blue') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('blue') }}</p>
                    </div>
                </div>

                <!-- Current Members Box (Compact display) -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-purple-300">当前队伍成员</h3>
                    <div class="space-y-3 max-h-32 overflow-y-auto">
                        <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                        <div v-else v-for="member in state.currentTeamMembers" :key="member.maimai_id || member.nickname" class="flex items-center justify-between">
                            <div class="flex items-center flex-grow mr-2">
                                <img
                                    v-if="member.avatar_url"
                                    :src="member.avatar_url"
                                    alt="头像"
                                    class="rounded-full w-8 h-8 object-cover mr-3 flex-shrink-0 border border-gray-600"
                                    :class="[`border-${member.color}-500`]"
                                >
                                <div
                                    v-else
                                    :class="`color-${member.color}-bg`"
                                    class="rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border border-gray-600"
                                >
                                    <img :src="getIconPath('color', member.color)" class="w-4 h-4 text-white" :alt="getColorText(member.color) + '图标'">
                                </div>

                                <div>
                                    <p class="font-medium text-sm">{{ member.nickname }}</p>
                                    <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                         <span class="flex items-center mr-2">
                                             <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                         </span>
                                        <span class="flex items-center">
                                             <img :src="getIconPath('job', member.job)" class="w-4 h-4 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                            {{ getJobText(member.job) }}
                                        </span>
                                    </p>
                                </div>
                            </div>
                             <button
                                v-if="isAuthenticated && currentUserMember && member.kinde_user_id === kindeUser?.id"
                                type="button"
                                @click="openEditModalForUser()"
                                class="flex-shrink-0 ml-auto px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-xs font-medium text-white transition-colors"
                                aria-label="修改我的报名信息"
                            >
                                修改
                            </button>
                        </div>
                    </div>
                </div>
                <!-- Navigation Buttons -->
                 <button @click="showStep(4)" :disabled="!state.selectedColor || isCollectionPaused" :class="{'opacity-50 cursor-not-allowed': !state.selectedColor || isCollectionPaused}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <!-- Navigate back to Step 2 (Team Code) -->
                <button type="button" @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- Step 4: Job Selection (Step number remains 4) -->
            <div id="step-job-selection" class="glass rounded-3xl p-4 sm:p-6 md:p-8 fade-in" v-if="state.currentStep === 4">
                 <!-- Header -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的职业</h1>
                    <p class="text-purple-300">每个队伍中的职业也必须唯一</p>
                </div>

                <!-- Team Info Box -->
                 <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                     <div class="flex items-center justify-between">
                         <div class="flex items-center">
                             <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md flex-shrink-0">
                                <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                            </div>
                            <div>
                                <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                                 <p class="text-xs text-gray-400">{{ state.teamCode || '----' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                            </div>
                         </div>
                         <!-- Selected Color Display -->
                         <div class="flex items-center glass rounded-full px-3 py-1 border border-gray-600 flex-shrink-0">
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full p-2 mb-1 shadow-md flex-shrink-0">
                                 <img :src="getIconPath('color', state.selectedColor)" class="w-5 h-5 text-white" :alt="getColorText(state.selectedColor) + '图标'">
                             </div>
                             <p class="text-xs font-medium text-gray-200">{{ getColorText(state.selectedColor) || '颜色' }}</p>
                        </div>
                    </div>
                </div>

                <!-- Job Options Grid -->
                 <div class="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-8">
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'attacker', 'disabled-option': isJobDisabled('attacker') }"
                         @click="selectJob('job-attacker')" @keydown.enter="selectJob('job-attacker')" @keydown.space="selectJob('job-attacker')">
                         <div class="job-attacker-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                             <img :src="getIconPath('job', 'attacker')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getJobText('attacker') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('attacker') }}</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'defender', 'disabled-option': isJobDisabled('defender') }"
                         @click="selectJob('job-defender')" @keydown.enter="selectJob('job-defender')" @keydown.space="selectJob('job-defender')">
                         <div class="job-defender-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                             <img :src="getIconPath('job', 'defender')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getJobText('defender') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('defender') }}</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'supporter', 'disabled-option': isJobDisabled('supporter') }"
                         @click="selectJob('job-supporter')" @keydown.enter="selectJob('job-supporter')" @keydown.space="selectJob('job-supporter')">
                        <div class="job-supporter-bg rounded-full w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img :src="getIconPath('job', 'supporter')" class="w-10 h-10 sm:w-12 sm:h-12 text-white" :alt="getJobText('supporter') + '图标'">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('supporter') }}</p>
                    </div>
                </div>

                <!-- Current Members Box (Compact display) -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                     <h3 class="text-sm font-medium mb-3 text-purple-300">当前队伍成员</h3>
                    <div class="space-y-3 max-h-32 overflow-y-auto">
                         <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                         <div v-else v-for="member in state.currentTeamMembers" :key="member.maimai_id || member.nickname" class="flex items-center justify-between">
                              <img
                                 v-if="member.avatar_url"
                                 :src="member.avatar_url"
                                 alt="头像"
                                 class="rounded-full w-8 h-8 object-cover mr-3 flex-shrink-0 border border-gray-600"
                                 :class="[`border-${member.color}-500`]"
                             >
                             <div
                                v-else
                                :class="`color-${member.color}-bg`"
                                class="rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border border-gray-600"
                              >
                                <img :src="getIconPath('color', member.color)" class="w-4 h-4 text-white" :alt="getColorText(member.color) + '图标'">
                              </div>

                            <div>
                                <p class="font-medium text-sm">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                     <span class="flex items-center mr-2">
                                         <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                     </span>
                                    <span class="flex items-center">
                                         <img :src="getIconPath('job', member.job)" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                        {{ getJobText(member.job) }}
                                    </span>
                                </p>
                            </div>
                             <button
                                v-if="isAuthenticated && currentUserMember && member.kinde_user_id === kindeUser?.id"
                                type="button"
                                @click="openEditModalForUser()"
                                class="flex-shrink-0 ml-auto px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-xs font-medium text-white transition-colors"
                                aria-label="修改我的报名信息"
                            >
                                修改
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                <button @click="showStep(5)" :disabled="!state.selectedJob || isCollectionPaused" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob || isCollectionPaused}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <!-- Navigate back to Step 3 (Color Selection) -->
                <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- Step 5: Personal Info (Step number remains 5) -->
            <div id="step-personal-info" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 5">
                 <!-- Header -->
                 <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">填写个人信息</h1>
                    <p class="text-purple-300">完成最后一步即可加入队伍</p>
                </div>

                <!-- Summary Box -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-center text-purple-300">你的选择</h3>
                    <div class="flex items-center justify-around">
                         <!-- Team -->
                        <div class="text-center flex flex-col items-center">
                             <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mb-1 shadow-md flex-shrink-0">
                                <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-4 h-4 text-white" alt="Team">
                            </div>
                            <p class="text-xs font-medium text-gray-200">{{ state.teamName || '队伍' }}</p>
                             <p class="text-xs text-gray-400">{{ state.teamCode || '代码' }}</p>
                        </div>
                         <!-- Color -->
                         <div class="text-center flex flex-col items-center">
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full p-2 mb-1 shadow-md flex-shrink-0">
                                 <img :src="getIconPath('color', state.selectedColor)" class="w-5 h-5 text-white" :alt="getColorText(state.selectedColor) + '图标'">
                             </div>
                             <p class="text-xs font-medium text-gray-200">{{ getColorText(state.selectedColor) || '颜色' }}</p>
                        </div>
                         <!-- Job -->
                         <div class="text-center flex flex-col items-center">
                            <div :class="`job-${state.selectedJob}-bg`" class="rounded-full p-2 mb-1 shadow-md job-summary-shadow flex-shrink-0">
                                <img :src="getIconPath('job', state.selectedJob)" class="w-5 h-5 text-white" :alt="getJobText(state.selectedJob) + '图标'">
                            </div>
                             <p class="text-xs font-medium text-gray-200">{{ getJobText(state.selectedJob) || '职业' }}</p>
                        </div>
                    </div>
                </div>

                <!-- Form -->
                 <form @submit.prevent="handleSubmitPersonalInfo()">

                    <!-- Avatar Upload Section -->
                    <div class="mb-6 text-center">
                        <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选, 最大 {{ MAX_AVATAR_SIZE_MB }}MB)</label>
                        <div class="flex flex-col items-center space-y-3">
                            <!-- Preview Image -->
                            <img v-if="state.avatarPreviewUrl" :src="state.avatarPreviewUrl" alt="头像预览" class="w-24 h-24 rounded-full object-cover border-2 border-purple-500 shadow-md">
                            <div v-else class="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-10 h-10 text-gray-400" alt="Default Avatar">
                            </div>
                             <!-- File Input Button using a label -->
                            <label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300" :class="{'opacity-50 cursor-not-allowed': isCollectionPaused}">
                                {{ state.avatarFile ? '更换头像' : '选择图片' }}
                            </label>
                            <!-- Hidden file input -->
                            <input type="file" id="avatar-upload" @change="handleAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden" :disabled="isCollectionPaused">

                            <!-- MODIFIED: Use dedicated clear function -->
                            <button v-if="state.avatarFile" type="button" @click="clearAvatarFile()" class="text-xs text-red-400 hover:text-red-500 transition" :disabled="isCollectionPaused">移除头像</button>
                        </div>
                    </div>

                    <!-- Other Fields -->
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID <span class="text-red-500">*</span></label>
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：Om1tted" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="13" :disabled="isCollectionPaused">
                         <p class="mt-1 text-xs text-gray-400">用于唯一识别你的报名信息。</p>
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：om1t" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50" :disabled="isCollectionPaused">
                    </div>

                    <div class="mb-6">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="qq-number" v-model="state.qqNumber" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15" :disabled="isCollectionPaused">
                         <p class="mt-1 text-xs text-gray-400">用于组队联系。</p>
                    </div>

                    <!-- Privacy Agreement -->
                     <div class="mb-6">
                        <label class="flex items-start cursor-pointer" :class="{'opacity-50 cursor-not-allowed': isCollectionPaused}">
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-500 rounded bg-gray-700 outline-none" :disabled="isCollectionPaused">
                             <span class="text-xs text-gray-300 select-none">我已阅读并同意<router-link to="/privacy" class="text-purple-400 hover:underline font-medium">隐私政策</router-link>，允许收集和使用我的QQ号用于组队联系目的。<span class="text-red-500">*</span></span>
                        </label>
                    </div>

                    <!-- Action Buttons -->
                    <button type="submit" :disabled="!state.privacyAgreed || state.showLoadingOverlay || isCollectionPaused" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :class="{'opacity-50 cursor-not-allowed': !state.privacyAgreed || state.showLoadingOverlay || isCollectionPaused}">
                         {{ state.showLoadingOverlay ? '正在完成...' : '完成注册' }}
                    </button>

                    <!-- Navigate back to Step 4 (Job Selection) -->
                    <button type="button" @click="showStep(4)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 6: Completion Page (Step number remains 6) -->
            <div id="step-completion" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 6">
                 <!-- Progress Bar (Completed) -->
                <div class="mb-8">
                    <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
                         <!-- Labels are hidden on completion page in this design -->
                    </div>
                    <div class="mb-8"><div class="mb-8" style="width: 100%;"></div></div>
                </div>

                <!-- Success Message -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 bg-gradient-to-br from-green-500 to-teal-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                         <!-- CORRECTED ICON NAME -->
                         <img src="https://unpkg.com/lucide-static@latest/icons/circle-check.svg" class="w-12 h-12 text-white" alt="Success">
                     </div>
                    <h1 class="text-3xl font-bold mb-2">注册成功！</h1>
                    <p class="text-teal-300">你已成功加入“<span class="font-bold">{{ state.teamName || '队伍' }}</span>”</p>
                </div>

                <!-- Team Info Box -->
                 <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                     <div class="flex items-center">
                         <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md flex-shrink-0">
                             <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                         </div>
                         <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                             <p class="text-xs text-gray-400">
                                 {{ state.teamCode || '----' }} · 成员: {{ state.completionAllMembers.length }}/3
                                 <span v-if="state.completionAllMembers.length === 3" class="ml-1 text-green-400 font-bold">(队伍已满)</span>
                             </p>
                        </div>
                    </div>
                </div>

                <!-- Final Member List -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-purple-300">队伍成员</h3>
                    <div class="space-y-3 max-h-48 overflow-y-auto">
                         <div v-if="state.completionAllMembers.length === 0" class="text-center text-gray-500 text-sm py-2">队伍信息加载中...</div>
                         <div v-else v-for="member in state.completionAllMembers" :key="member.maimai_id || member.nickname" class="flex items-center relative">
                             <img
                                 v-if="member.avatar_url"
                                 :src="member.avatar_url"
                                 alt="头像"
                                 class="rounded-full w-10 h-10 object-cover mr-3 flex-shrink-0 border-2 border-gray-600"
                                 :class="[`border-${member.color}-500`]"
                             >
                              <div
                                v-else
                                :class="`color-${member.color}-bg`"
                                class="rounded-full w-10 h-10 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border-2 border-gray-600"
                              >
                                <img :src="getIconPath('color', member.color)" class="w-5 h-5 text-white" :alt="getColorText(member.color) + '图标'">
                              </div>

                            <div class="flex-grow">
                                 <p class="font-medium text-sm flex items-center">
                                    {{ member.nickname }}
                                    <span v-if="isAuthenticated && kindeUser && member.kinde_user_id === kindeUser.id" class="ml-2 text-xs bg-purple-600 px-1.5 py-0.5 rounded text-white font-bold">你</span>
                                </p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                     <span class="flex items-center mr-2">
                                         <span :class="`color-indicator color-${member.color}-bg`"></span>
                                         {{ getColorText(member.color) }}
                                     </span>
                                    <span class="flex items-center">
                                         <img :src="getIconPath('job', member.job)" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                        {{ getJobText(member.job) }}
                                    </span>
                                </p>
                            </div>
                         </div>
                    </div>
                     <div class="mt-6 text-center">
                         <button
                             v-if="isAuthenticated && currentUserMember"
                             @click="openEditModalForUser()"
                             class="bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center mx-auto"
                             :disabled="isCollectionPaused"
                         >
                             <img src="https://unpkg.com/lucide-static@latest/icons/file-pen.svg" class="w-4 h-4 mr-2" alt="Edit">
                             修改我的报名信息
                         </button>
                         <p v-else class="text-sm text-gray-400">请登录以修改你的报名信息。</p>
                     </div>
                </div>

                 <!-- Invite Section -->
                 <div class="mb-8">
                     <h3 class="text-center font-medium mb-4 text-purple-300">邀请好友加入 ({{ state.completionAllMembers.length }}/3)</h3>

                     <!-- QR Code -->
                     <div class="qr-code-container mb-4">
                         <qrcode-vue
                            v-if="shareLinkUrl"
                            :value="shareLinkUrl"
                            :size="140"
                            level="H"
                            render-as="svg"
                            background="#ffffff"
                            foreground="#111827"
                            class="rounded-lg shadow-md"
                          />
                         <div v-else class="w-[140px] h-[140px] bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 text-xs">
                            生成中...
                        </div>
                     </div>

                     <!-- Share Link Input & Copy Button -->
                     <div class="flex mb-4 mt-4">
                        <input
                             type="text"
                             id="shareLink"
                             readonly
                             :value="shareLinkUrl"
                             class="share-link w-full rounded-l-lg py-3 px-4 text-white focus:outline-none text-sm"
                             placeholder="分享链接生成中..."
                             aria-label="分享链接"
                         >
                         <button
                             id="copyBtn"
                             type="button"
                             @click="copyShareLink()"
                             class="bg-purple-700 hover:bg-purple-600 rounded-r-lg px-4 transition duration-200 flex items-center justify-center"
                             :disabled="!shareLinkUrl"
                             :class="{'opacity-50 cursor-not-allowed': !shareLinkUrl}"
                             aria-label="复制链接"
                         >
                             <img src="https://unpkg.com/lucide-static@latest/icons/copy.svg" class="w-5 h-5 text-white" alt="Copy">
                        </button>
                    </div>
                </div>

                <!-- Back to Home Button -->
                <button type="button" @click="goHome()" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300 mb-4">
                    返回首页
                </button>

                 <!-- Logout Button -->
                 <button
                     v-if="isAuthenticated"
                     type="button"
                     @click="logout()"
                     class="w-full bg-red-700 hover:bg-red-600 rounded-lg py-3 font-bold transition duration-300"
                 >
                     退出登录
                 </button>

            </div> <!-- End of Step 6 -->

             </div> <!-- End of relative z-10 block -->

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8 relative z-10">
                 <p>{{ new Date().getFullYear() }} © NGU Team © MPAM Laboratory | <router-link to="/privacy" class="text-purple-400 hover:underline font-medium">隐私政策</router-link></p>
            </div>

        <!-- Modals -->
        <!-- Confirm Join Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6 text-sm text-gray-200">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍。当前成员 <span class="font-bold">{{ state.currentTeamMembers.length }}</span>/3。</p>
                 <div v-if="state.currentTeamMembers.length > 0" class="mb-4 space-y-2 max-h-32 overflow-y-auto text-sm border-t border-b border-gray-700 py-2 px-1">
                     <span class="font-semibold text-purple-300 block mb-1">现有成员:</span>
                      <div v-for="member in state.currentTeamMembers" :key="member.maimai_id || (member.nickname + member.qq_number)" class="flex items-center justify-between">
                         <div class="flex items-center flex-grow mr-2">
                             <img
                                 v-if="member.avatar_url"
                                 :src="member.avatar_url"
                                 alt="头像"
                                 class="rounded-full w-6 h-6 object-cover mr-2 flex-shrink-0 border border-gray-600"
                                 :class="[`border-${member.color}-500`]"
                             >
                              <div
                                v-else
                                :class="`color-${member.color}-bg`"
                                class="rounded-full w-6 h-6 flex items-center justify-center mr-2 flex-shrink-0 shadow-sm border border-gray-600"
                              >
                                <img :src="getIconPath('color', member.color)" class="w-3 h-3 text-white" :alt="getColorText(member.color) + '图标'">
                              </div>
                             <span class="text-gray-300 flex-grow">{{ member.nickname }} ({{ getColorText(member.color) }}, {{ getJobText(member.job) }})</span>
                         </div>
                         <!-- Edit button in modal - only show if it's the current user -->
                         <button
                            v-if="isAuthenticated && currentUserMember && member.kinde_user_id === kindeUser?.id"
                             type="button"
                             @click="openEditModalForUser()"
                             class="flex-shrink-0 ml-auto px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-xs font-medium text-white transition-colors"
                             aria-label="修改我的报名信息"
                         >
                            修改
                         </button>
                     </div>
                 </div>
                 <p v-else class="mb-4 text-sm text-gray-400 italic">队伍目前还没有成员。</p>

                <div class="flex space-x-4">
                    <button type="button" @click="state.showConfirmModal = false; /* Keep loading state managed by handleContinue finally */" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button type="button" @click="confirmJoinTeam()" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium" :disabled="isCollectionPaused">
                        确认加入
                    </button>
                </div>
            </div>
        </div>

        <!-- Create Team Modal -->
       <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showCreateModal">
           <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4">创建新队伍</h3>
                <p class="mb-4 text-sm text-gray-200">组队码 <span class="font-bold text-purple-400">{{ state.teamCode }}</span> 未被使用。请为你的队伍命名：</p>
                <div class="mb-6">
                    <label for="newTeamName" class="block text-sm font-medium text-purple-300 mb-2">队伍名称 <span class="text-red-500">*</span></label>
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：对不队" class="w-full form-input rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="20" @keydown.enter="createNewTeam()" :disabled="isCollectionPaused">
                     <p v-if="state.errorMessage && state.showCreateModal" class="mt-2 text-xs text-red-400">{{ state.errorMessage }}</p>
                </div>
                <div class="flex space-x-4">
                    <button type="button" @click="state.showCreateModal = false; state.errorMessage = null;" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button type="button" @click="createNewTeam()" :disabled="!state.newTeamName?.trim() || isCollectionPaused" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium" :class="{'opacity-50 cursor-not-allowed': !state.newTeamName?.trim() || isCollectionPaused}">
                        确认创建
                    </button>
                </div>
            </div>
        </div>

        <!-- NEW: Team Full Info Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showTeamFullInfoModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4 text-center">队伍信息 (已满)</h3>
                <p class="mb-4 text-sm text-gray-200 text-center">
                    队伍 "<span class="text-purple-400 font-bold">{{ state.teamName || '加载中...' }}</span>" ({{ state.teamCode }})
                    <br>
                    已满员 ({{ state.currentTeamMembers.length }}/3)，无法加入。
                </p>

                <!-- Member List -->
                <div class="mb-6 space-y-3 max-h-48 overflow-y-auto text-sm border-t border-b border-gray-700 py-3 px-2">
                    <h4 class="font-semibold text-purple-300 block mb-2 text-center">当前成员:</h4>
                    <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无成员信息</div>
                    <!-- Loop through state.currentTeamMembers -->
                    <div v-else v-for="member in state.currentTeamMembers" :key="member.maimai_id || (member.nickname + member.qq_number)" class="flex items-center p-1 bg-gray-800 bg-opacity-30 rounded-md">
                        <!-- Avatar -->
                        <img
                            v-if="member.avatar_url"
                            :src="member.avatar_url"
                            alt="头像"
                            class="rounded-full w-8 h-8 object-cover mr-3 flex-shrink-0 border border-gray-600"
                            :class="[`border-${member.color}-500`]"
                        >
                        <div
                            v-else
                            :class="`color-${member.color}-bg`"
                            class="rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border border-gray-600"
                        >
                            <img :src="getIconPath('color', member.color)" class="w-4 h-4 text-white" :alt="getColorText(member.color) + '图标'">
                        </div>
                        <!-- Info -->
                        <div class="flex-grow">
                            <p class="font-medium text-sm text-white">{{ member.nickname }}</p>
                            <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                <span class="flex items-center mr-2">
                                    <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                </span>
                                <span class="flex items-center">
                                    <img :src="getIconPath('job', member.job)" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job) + '图标'">
                                    {{ getJobText(member.job) }}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Close Button -->
                <div class="flex justify-center">
                    <button
                        type="button"
                        @click="state.showTeamFullInfoModal = false"
                        class="w-full sm:w-auto py-2 px-6 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
        <!-- End of Team Full Info Modal -->


        <!-- Edit/Delete Member Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showEditModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4 text-center">修改我的信息</h3>
                 <p class="mb-6 text-sm text-gray-300 text-center">修改你的报名信息。</p>

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

                 <!-- Editable Fields -->
                 <div class="mb-6">
                     <h4 class="text-md font-semibold mb-3 text-purple-300">修改信息 (留空不修改)</h4>

                     <!-- New Avatar Upload Section (within modal) -->
                     <div class="mb-6 text-center">
                         <label class="block text-sm font-medium text-purple-300 mb-3">上传新头像 (可选, 最大 {{ MAX_AVATAR_SIZE_MB }}MB)</label>
                         <div class="flex flex-col items-center space-y-3">
                             <!-- Preview Image -->
                             <img v-if="state.editNewAvatarPreviewUrl" :src="state.editNewAvatarPreviewUrl" alt="新头像预览" class="w-20 h-20 rounded-full object-cover border-2 border-purple-500 shadow-md">
                             <div v-else class="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                 <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-8 h-8 text-gray-400" alt="Default Avatar">
                             </div>
                              <!-- File Input Button -->
                             <label for="edit-avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300" :class="{'opacity-50 cursor-not-allowed': isCollectionPaused}">
                                 {{ state.editNewAvatarFile ? '更换头像' : '选择图片' }}
                             </label>
                             <!-- Hidden file input -->
                             <input type="file" id="edit-avatar-upload" @change="handleEditAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden" :disabled="isCollectionPaused">
                             <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>

                             <!-- Option to clear existing avatar -->
                             <label class="flex items-center cursor-pointer text-xs text-gray-300 hover:text-white transition" :class="{'opacity-50 cursor-not-allowed': isCollectionPaused}">
                                 <input type="checkbox" v-model="state.editClearAvatarFlag" class="mr-1 h-3 w-3 text-red-600 focus:ring-red-500 border-gray-500 rounded bg-gray-700 outline-none" :disabled="isCollectionPaused">
                                 移除当前头像 (如果已上传)
                             </label>
                         </div>
                     </div> <!-- End New Avatar Section -->

                    <div class="mb-4">
                        <label for="edit-nickname" class="block text-sm font-medium text-purple-300 mb-2">新称呼</label>
                        <input type="text" id="edit-nickname"
                               v-model="state.editNewNickname"
                               placeholder="留空不修改"
                               class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                               maxlength="50"
                               :disabled="isCollectionPaused">
                    </div>

                    <div class="mb-4">
                        <label for="edit-qq-number" class="block text-sm font-medium text-purple-300 mb-2">新QQ号</label>
                        <input type="text" inputmode="numeric" id="edit-qq-number"
                               v-model="state.editNewQqNumber"
                               placeholder="留空不修改"
                               class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                               pattern="[1-9][0-9]{4,14}"
                               maxlength="15"
                               :disabled="isCollectionPaused">
                    </div>

                     <!-- New Color Selection -->
                     <div class="mb-4">
                         <label class="block text-sm font-medium text-purple-300 mb-2">新元素</label>
                         <div class="grid grid-cols-3 gap-2">
                             <div role="button" tabindex="0" class="color-option-small"
                                  :class="{ selected: state.editNewColor === 'red', 'disabled-option': isColorDisabled('red') && state.editNewColor !== 'red' }"
                                  @click="state.editNewColor = 'red'" @keydown.enter="state.editNewColor = 'red'" @keydown.space="state.editNewColor = 'red'">
                                 <div class="color-red-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('color', 'red')" class="w-4 h-4 text-white" :alt="getColorText('red') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getColorText('red') }}</p>
                             </div>
                             <div role="button" tabindex="0" class="color-option-small"
                                  :class="{ selected: state.editNewColor === 'green', 'disabled-option': isColorDisabled('green') && state.editNewColor !== 'green' }"
                                  @click="state.editNewColor = 'green'" @keydown.enter="state.editNewColor = 'green'" @keydown.space="state.editNewColor = 'green'">
                                 <div class="color-green-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('color', 'green')" class="w-4 h-4 text-white" :alt="getColorText('green') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getColorText('green') }}</p>
                             </div>
                             <div role="button" tabindex="0" class="color-option-small"
                                  :class="{ selected: state.editNewColor === 'blue', 'disabled-option': isColorDisabled('blue') && state.editNewColor !== 'blue' }"
                                  @click="state.editNewColor = 'blue'" @keydown.enter="state.editNewColor = 'blue'" @keydown.space="state.editNewColor = 'blue'">
                                 <div class="color-blue-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('color', 'blue')" class="w-4 h-4 text-white" :alt="getColorText('blue') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getColorText('blue') }}</p>
                             </div>
                         </div>
                         <p class="mt-1 text-xs text-gray-400">留空不修改。已占用元素不可选。</p>
                     </div>

                     <!-- New Job Selection -->
                     <div class="mb-6">
                         <label class="block text-sm font-medium text-purple-300 mb-2">新职业</label>
                         <div class="grid grid-cols-3 gap-2">
                             <div role="button" tabindex="0" class="job-option-small"
                                  :class="{ selected: state.editNewJob === 'attacker', 'disabled-option': isJobDisabled('attacker') && state.editNewJob !== 'attacker' }"
                                  @click="state.editNewJob = 'attacker'" @keydown.enter="state.editNewJob = 'attacker'" @keydown.space="state.editNewJob = 'attacker'">
                                 <div class="job-attacker-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('job', 'attacker')" class="w-4 h-4 text-white" :alt="getJobText('attacker') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getJobText('attacker') }}</p>
                             </div>
                             <div role="button" tabindex="0" class="job-option-small"
                                  :class="{ selected: state.editNewJob === 'defender', 'disabled-option': isJobDisabled('defender') && state.editNewJob !== 'defender' }"
                                  @click="state.editNewJob = 'defender'" @keydown.enter="state.editNewJob = 'defender'" @keydown.space="state.editNewJob = 'defender'">
                                 <div class="job-defender-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('job', 'defender')" class="w-4 h-4 text-white" :alt="getJobText('defender') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getJobText('defender') }}</p>
                             </div>
                             <div role="button" tabindex="0" class="job-option-small"
                                  :class="{ selected: state.editNewJob === 'supporter', 'disabled-option': isJobDisabled('supporter') && state.editNewJob !== 'supporter' }"
                                  @click="state.editNewJob = 'supporter'" @keydown.enter="state.editNewJob = 'supporter'" @keydown.space="state.editNewJob = 'supporter'">
                                 <div class="job-supporter-bg rounded-full w-8 h-8 mx-auto mb-1 flex items-center justify-center">
                                     <img :src="getIconPath('job', 'supporter')" class="w-4 h-4 text-white" :alt="getJobText('supporter') + '图标'">
                                 </div>
                                 <p class="text-center font-medium text-xs">{{ getJobText('supporter') }}</p>
                             </div>
                         </div>
                         <p class="mt-1 text-xs text-gray-400">留空不修改。已占用职业不可选。</p>
                     </div>

                 </div> <!-- End Editable Fields -->

                 <!-- ADDED: Message if collection is paused -->
                 <div v-if="isCollectionPaused" class="text-center text-yellow-400 mb-6 font-bold">
                     <p>报名收集已暂停，无法修改信息。</p>
                 </div>
                 <!-- END ADDED -->

                 <p v-if="state.editModalErrorMessage" class="mt-2 text-xs text-red-400 text-center mb-4">{{ state.editModalErrorMessage }}</p>

                <div class="flex space-x-4">
                    <button type="button" @click="closeEditModal()" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button type="button" @click="saveChanges()" :disabled="state.showLoadingOverlay || isCollectionPaused" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium" :class="{'opacity-50 cursor-not-allowed': state.showLoadingOverlay || isCollectionPaused}">
                         {{ state.showLoadingOverlay ? '正在保存...' : '保存修改' }}
                    </button>
                </div>
                 <div class="mt-4 text-center">
                     <button type="button" @click="deleteEntry()" :disabled="state.showLoadingOverlay || isCollectionPaused" class="text-red-400 hover:text-red-500 text-sm font-medium transition" :class="{'opacity-50 cursor-not-allowed': state.showLoadingOverlay || isCollectionPaused}">
                         删除我的报名信息
                     </button>
                 </div>
            </div>
        </div> <!-- End of Modals -->

        <!-- Loading Overlay -->
        <div v-if="state.showLoadingOverlay" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm">
            <div class="text-center text-white">
                <div class="loader mb-4"></div>
                <p class="text-lg font-semibold">加载中...</p>
            </div>
        </div>

         <!-- Confetti Layer -->
         <div id="celebration" class="fixed inset-0 pointer-events-none z-40"></div>

    </div> <!-- End of Root container -->
</template>

<style scoped>
/* Add or update your existing styles */

/* General Styles */
.glass {
    background-color: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.fade-in {
    animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.fade-in-up {
    animation: fadeInUp 0.5s ease-out;
}

@keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}


/* Progress Bar */
.progress-bar {
    width: 100%;
    height: 8px;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(to right, #a78bfa, #6d28d9); /* Purple gradient */
    border-radius: 4px;
    transition: width 0.5s ease-in-out;
}

/* Input Styles */
.form-input {
    background-color: rgba(31, 41, 55, 0.7); /* bg-gray-800 with opacity */
    border: 1px solid rgba(75, 85, 99, 0.5); /* border-gray-600 with opacity */
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.form-input:focus {
    border-color: #8b5cf6; /* purple-500 */
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.5); /* purple-500 shadow */
}

.input-code {
     background-color: rgba(31, 41, 55, 0.7); /* bg-gray-800 with opacity */
     border: 1px solid rgba(75, 85, 99, 0.5); /* border-gray-600 with opacity */
     transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.input-code:focus {
    border-color: #8b5cf6; /* purple-500 */
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.5); /* purple-500 shadow */
}


/* Button Glow Effect */
.btn-glow {
    position: relative;
    overflow: hidden;
    z-index: 1;
}

.btn-glow::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 300%;
    height: 300%;
    background: radial-gradient(circle, rgba(139, 92, 246, 0.6) 0%, rgba(139, 92, 246, 0) 70%); /* purple-500 glow */
    transition: transform 0.5s ease-out;
    transform: translate(-50%, -50%) scale(0);
    z-index: -1;
}

.btn-glow:hover::before {
    transform: translate(-50%, -50%) scale(1);
}

/* Color Options */
.color-option, .job-option {
    cursor: pointer;
    padding: 1rem;
    border-radius: 0.75rem; /* rounded-xl */
    transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    background-color: rgba(31, 41, 55, 0.5); /* bg-gray-800 with opacity */
    border: 1px solid rgba(75, 85, 99, 0.5); /* border-gray-600 with opacity */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.color-option:hover:not(.disabled-option),
.job-option:hover:not(.disabled-option) {
    transform: translateY(-5px);
    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.3);
    background-color: rgba(55, 65, 81, 0.6); /* Slightly lighter gray */
}

.color-option.selected,
.job-option.selected {
    border-color: #8b5cf6; /* purple-500 */
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.5); /* purple-500 shadow */
    background-color: rgba(139, 92, 246, 0.2); /* Light purple background */
}

.disabled-option {
    opacity: 0.5;
    cursor: not-allowed;
    /* pointer-events: none; /* Disable clicks - handled by @click logic */
}

/* Color Backgrounds */
.color-red-bg { background: linear-gradient(to bottom right, #ef4444, #b91c1c); } /* red-500 to red-700 */
.color-green-bg { background: linear-gradient(to bottom right, #22c55e, #15803d); } /* green-500 to green-700 */
.color-blue-bg { background: linear-gradient(to bottom right, #3b82f6, #1d4ed8); } /* blue-500 to blue-700 */

/* Job Backgrounds */
.job-attacker-bg { background: linear-gradient(to bottom right, #f97316, #c2410c); } /* orange-500 to orange-700 */
.job-defender-bg { background: linear-gradient(to bottom right, #14b8a6, #0d9488); } /* teal-500 to teal-700 */
.job-supporter-bg { background: linear-gradient(to bottom right, #a855f7, #7e22ce); } /* purple-500 to purple-700 */

/* Color Indicator */
.color-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
}

/* Share Link */
.share-link {
    background-color: rgba(31, 41, 55, 0.7); /* bg-gray-800 with opacity */
    border: 1px solid rgba(75, 85, 99, 0.5); /* border-gray-600 with opacity */
    border-right: none; /* Remove right border to blend with button */
    font-family: monospace; /* Use monospace for code/links */
}
.share-link:focus {
     border-color: #8b5cf6; /* purple-500 */
     box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.5); /* purple-500 shadow */
     border-right: none; /* Ensure right border stays off */
}

/* QR Code Container */
.qr-code-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem;
    background-color: #ffffff; /* White background for QR code */
    border-radius: 0.75rem;
    width: fit-content;
    margin: 0 auto;
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
        transform: translateY(var(--start-y, 0vh)) translateX(var(--start-x, 0vw)) rotate(var(--start-rotate, 0deg));
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

/* Small Color/Job Options in Modal */
.color-option-small, .job-option-small {
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.5rem;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    background-color: rgba(31, 41, 55, 0.5);
    border: 1px solid rgba(75, 85, 99, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.color-option-small:hover:not(.disabled-option),
.job-option-small:hover:not(.disabled-option) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    background-color: rgba(55, 65, 81, 0.6);
}
.color-option-small.selected,
.job-option-small.selected {
    border-color: #8b5cf6; /* purple-500 */
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.5); /* purple-500 shadow */
    background-color: rgba(139, 92, 246, 0.2);
}
.color-option-small .color-red-bg, .color-option-small .color-green-bg, .color-option-small .color-blue-bg,
.job-option-small .job-attacker-bg, .job-option-small .job-defender-bg, .job-option-small .job-supporter-bg {
    width: 32px; /* w-8 */
    height: 32px; /* h-8 */
    padding: 0.25rem; /* p-1 */
    margin-bottom: 0.25rem; /* mb-1 */
}
.color-option-small .color-red-bg img, .color-option-small .color-green-bg img, .color-option-small .color-blue-bg img,
.job-option-small .job-attacker-bg img, .job-option-small .job-defender-bg img, .job-option-small .job-supporter-bg img {
    width: 16px; /* w-4 */
    height: 16px; /* h-4 */
}

/* Loading Overlay Spinner */
.loader {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid #fff;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Confetti Animation */
.confetti {
    position: absolute;
    width: 8px;
    height: 8px;
    opacity: 0.8;
    animation: confetti-fall linear infinite;
}

@keyframes confetti-fall {
    0% {
        transform: translateY(var(--start-y, 0vh)) translateX(var(--start-x, 0vw)) rotate(var(--start-rotate, 0deg));
        opacity: 0.8;
    }
    100% {
        transform: translateY(var(--end-y, 100vh)) translateX(var(--end-x, 0vw)) rotate(var(--end-rotate, 720deg));
        opacity: 0;
    }
}

</style>
