<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import QrcodeVue from 'qrcode.vue'; // Import QR Code component

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api'; // Default for local testing
// Use environment variable for website link, with a fallback for local dev
const websiteLink = computed(() => import.meta.env.VITE_WEBSITE_LINK || window.location.origin);

// --- State Management (Reactive) ---
const state = reactive({
    currentStep: 1,
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
    avatarFile: null, // For storing the selected avatar file object
    avatarPreview: null, // For displaying avatar preview (Data URL)

    // UI State
    showConfirmModal: false,
    showCreateModal: false,
    showLoadingOverlay: false,
    errorMessage: null,

    // Data fetched from API
    currentTeamMembers: [],
    completionAllMembers: [],

    confettiInterval: null,
});

// --- Computed Properties ---
const progressWidth = computed(() => {
    const stepProgress = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };
    return `${stepProgress[state.currentStep]}%`;
});

const isColorDisabled = computed(() => (color) => {
    return state.currentTeamMembers.some(member => member.color === color);
});

const isJobDisabled = computed(() => (jobType) => {
    return state.currentTeamMembers.some(member => member.job === jobType);
});

// Computed property for the shareable URL
const shareUrl = computed(() => {
    return state.teamCode ? `${websiteLink.value}/?code=${state.teamCode}` : websiteLink.value;
});

// --- Methods / Functions ---

function showStep(stepNumber) {
    if (state.currentStep === 5 && state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
        const celebrationDiv = document.getElementById('celebration');
        if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
    if (stepNumber === 4) {
        // Reset avatar state if going back to step 4 or from previous steps
        // (Or adjust logic if you want avatar preserved when going back and forth)
        // state.avatarFile = null;
        // state.avatarPreview = null;
    }

    state.currentStep = stepNumber;
    state.errorMessage = null;

    if (stepNumber === 5) {
         setTimeout(() => {
             createConfetti();
             state.confettiInterval = setInterval(createConfetti, 2000);
         }, 100);
    }
}

async function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null;

    if (code.length !== 4 || isNaN(parseInt(code))) {
        state.errorMessage = '请输入4位数字的组队码';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/check`, { /* ... same as before ... */ });
        // ... rest of handleContinue logic remains the same ...
        if (!response.ok) {
            console.error('API error:', response.status, response.statusText);
            const errorData = await response.json().catch(() => ({})); // Try to parse error
            state.errorMessage = errorData.error || `检查队伍时出错 (${response.status})`;
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        if (data.exists) {
            state.teamName = data.name;
            state.currentTeamMembers = data.members || [];
            state.isNewTeam = false;
            state.showConfirmModal = true;
        } else {
            state.teamName = null;
            state.currentTeamMembers = [];
            state.isNewTeam = true;
            state.showCreateModal = true;
        }

    } catch (e) {
        console.error('API Error checking team:', e);
         if (!state.errorMessage) { // Avoid overwriting specific API errors
             state.errorMessage = '连接服务器失败，请稍后再试。';
         }
    } finally {
        state.showLoadingOverlay = false;
    }
}

function confirmJoinTeam() {
    state.showConfirmModal = false;
    showStep(2);
}

async function createNewTeam() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null;

    if (!name) {
        state.errorMessage = '请输入队伍名称';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, { /* ... same as before ... */ });
        // ... rest of createNewTeam logic remains the same ...
        const data = await response.json();

        if (!response.ok) {
             state.errorMessage = data.error || '创建队伍失败';
             return;
        }

        state.teamName = data.name;
        state.currentTeamMembers = [];
        state.showCreateModal = false;
        showStep(2);

    } catch (e) {
        console.error('API Error creating team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

function selectColor(color) {
    if (!isColorDisabled.value(color)) {
        state.selectedColor = color;
    }
}

function getColorText(colorId) {
     switch(colorId) {
         case 'red': return '红色';
         case 'green': return '绿色';
         case 'blue': return '蓝色';
         default: return '';
     }
}

function getColorIcon(colorId) {
     switch(colorId) {
         case 'red': return 'flame';
         case 'green': return 'leaf';
         case 'blue': return 'droplets';
         default: return 'help-circle';
     }
}

function selectJob(jobId) {
     const jobType = jobId.replace('job-', '');
    if (!isJobDisabled.value(jobType)) {
        state.selectedJob = jobType;
    }
}

function getJobText(jobType) {
     switch(jobType) {
         case 'attacker': return '攻击手';
         case 'defender': return '防御手';
         case 'supporter': return '辅助手';
         default: return '';
     }
}

function getJobIcon(jobType) {
     switch(jobType) {
         case 'attacker': return 'swords';
         case 'defender': return 'shield';
         case 'supporter': return 'heart-pulse';
         default: return 'help-circle';
     }
}

// --- Avatar Handling ---
function triggerAvatarUpload() {
    document.getElementById('avatar-upload-input')?.click();
}

function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
        state.avatarFile = null;
        state.avatarPreview = null;
        return;
    }

    // Optional: Basic validation (e.g., type, size)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.errorMessage = '请上传图片文件 (JPG, PNG, GIF, WebP)';
        state.avatarFile = null;
        state.avatarPreview = null;
        // Clear the input value so the same file can be selected again if needed after error
        event.target.value = null;
        return;
    }
    const maxSizeInMB = 2; // Example: 2MB limit
    if (file.size > maxSizeInMB * 1024 * 1024) {
         state.errorMessage = `文件大小不能超过 ${maxSizeInMB}MB`;
         state.avatarFile = null;
         state.avatarPreview = null;
         event.target.value = null;
         return;
    }

    state.avatarFile = file;
    state.errorMessage = null; // Clear previous errors

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
        state.avatarPreview = e.target?.result;
    };
    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        state.errorMessage = "无法预览图片";
        state.avatarPreview = null;
    }
    reader.readAsDataURL(file);
}

// --- Form Submission with Avatar ---
async function handleSubmitPersonalInfo() {
    state.errorMessage = null;

    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私政策';
        return;
    }
     if (!state.selectedColor || !state.selectedJob) {
         state.errorMessage = '请选择颜色和职业';
         return;
     }
     // Optional: Check if avatar is uploaded, though it might not be mandatory
     // if (!state.avatarFile) {
     //     state.errorMessage = '请上传头像';
     //     return;
     // }

    state.showLoadingOverlay = true;

    // --- Use FormData for file upload ---
    const formData = new FormData();
    formData.append('teamCode', state.teamCode);
    formData.append('color', state.selectedColor);
    formData.append('job', state.selectedJob);
    formData.append('maimaiId', state.maimaiId.trim());
    formData.append('nickname', state.nickname.trim());
    formData.append('qqNumber', state.qqNumber.trim());
    if (state.avatarFile) {
        formData.append('avatar', state.avatarFile, state.avatarFile.name); // Key 'avatar', value is the file
    }

    try {
        // IMPORTANT: Backend must handle multipart/form-data
        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
             // No 'Content-Type' header needed - browser sets it for FormData
            body: formData, // Send FormData object
        });

        const data = await response.json();

        if (!response.ok) {
             state.errorMessage = data.error || '提交信息失败';
             return;
        }

        state.completionAllMembers = data.members || [];
        state.teamName = data.name; // Update team name from response
        showStep(5);

    } catch (e) {
        console.error('API Error joining team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// --- Other Functions (copyShareLink, goHome, createConfetti) ---
function copyShareLink() {
    const shareLinkInput = document.getElementById('shareLink');
    if (shareLinkInput) {
        // Use the computed shareUrl for copying
        const textToCopy = shareUrl.value;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const copyBtn = document.getElementById('copyBtn');
            if (copyBtn) {
                const originalIcon = copyBtn.innerHTML;
                copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="Copied">';
                setTimeout(() => {
                    copyBtn.innerHTML = originalIcon;
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy text using clipboard API: ', err);
            // Fallback attempt (less reliable)
            try {
                shareLinkInput.select(); // Select the input content for execCommand
                shareLinkInput.setSelectionRange(0, 99999);
                document.execCommand('copy');
                const copyBtn = document.getElementById('copyBtn');
                if (copyBtn) {
                   const originalIcon = copyBtn.innerHTML;
                   copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="Copied">';
                   setTimeout(() => {
                       copyBtn.innerHTML = originalIcon;
                   }, 2000);
                }
            } catch (execErr) {
               console.error('Failed to copy text using execCommand: ', execErr);
               alert('复制失败，请手动复制链接。');
            }
        });
    }
}

function goHome() {
    // Reset all relevant state variables, including avatar state
    state.teamCode = null;
    state.teamName = null;
    state.isNewTeam = false;
    state.newTeamName = null;
    state.selectedColor = null;
    state.selectedJob = null;
    state.maimaiId = null;
    state.nickname = null;
    state.qqNumber = null;
    state.privacyAgreed = false;
    state.avatarFile = null; // Reset avatar
    state.avatarPreview = null; // Reset preview
    state.showConfirmModal = false;
    state.showCreateModal = false;
    state.showLoadingOverlay = false;
    state.errorMessage = null;
    state.currentTeamMembers = [];
    state.completionAllMembers = [];

    history.replaceState({}, document.title, window.location.pathname);
    showStep(1);
}

// Confetti function remains the same
function createConfetti() { /* ... same as before ... */ }

// --- Lifecycle Hooks ---
onMounted(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');

    if (codeParam && codeParam.length === 4 && !isNaN(parseInt(codeParam))) {
        state.teamCode = codeParam;
        handleContinue();
    }
    // Ensure initial render is correct if no code param
    // showStep(state.currentStep); // showStep is called implicitly by handleContinue or default state
});

onUnmounted(() => {
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
});

</script>

<template>
    <!-- Root container with centering and vertical scrolling -->
    <div class="bg-gray-900 text-white min-h-screen flex items-center justify-center px-4 py-8 overflow-y-auto">

        <!-- Content Container -->
        <div class="container max-w-sm mx-auto w-full"> <!-- Or max-w-md for slightly larger on desktop -->

            <!-- Progress Bar -->
            <div class="mb-8" v-if="state.currentStep > 1 && state.currentStep < 5">
                 <!-- ... progress bar unchanged ... -->
                <div class="flex justify-between text-xs text-gray-400 mb-2">
                    <span>组队码</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 2}">颜色</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 3}">职业</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 4}">个人信息</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: progressWidth }"></div>
                </div>
            </div>

            <!-- Error Message Display -->
            <div v-if="state.errorMessage" class="bg-red-600 bg-opacity-80 text-white text-sm p-3 rounded-lg mb-6 fade-in">
                {{ state.errorMessage }}
            </div>

            <!-- Step 1: Team Code Input -->
            <div id="step-team-code" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 1">
                 <!-- ... step 1 unchanged ... -->
                <div class="text-center mb-8">
                    <div class="w-24 h-24 bg-purple-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-12 h-12 text-white" alt="Team">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">舞萌队伍注册</h1>
                    <p class="text-purple-300">输入四位数组队码开始</p>
                </div>

                <div class="mb-8">
                    <label for="teamCode" class="block text-sm font-medium text-purple-300 mb-2">组队码</label>
                    <input type="text" id="teamCode" v-model="state.teamCode" maxlength="4" placeholder="1234" class="input-code w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-4 px-6 text-2xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <p class="mt-2 text-xs text-gray-400">请输入四位数字的组队码</p>
                </div>

                <button @click="handleContinue" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    继续
                </button>

                <p class="text-center text-sm text-gray-400">
                    没有组队码？系统将自动为你创建新队伍
                </p>
            </div>

            <!-- Step 2: Color Selection -->
            <div id="step-color-selection" class="glass rounded-3xl p-8" v-show="state.currentStep === 2">
                 <!-- ... step 2 unchanged ... -->
                 <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的颜色</h1>
                    <p class="text-purple-300">每个队伍中的成员需要选择不同的颜色</p>
                </div>
                <!-- ... Team Info, Color Options, Member List, Buttons ... -->
                <div class="glass rounded-xl p-4 mb-8">
                    <div class="flex items-center">
                        <div class="bg-purple-600 rounded-full p-2 mr-3">
                            <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                        </div>
                        <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4 mb-8">
                    <!-- Color options -->
                   <div class="color-option" id="color-red" :class="{ selected: state.selectedColor === 'red', 'disabled-option': isColorDisabled('red') }" @click="selectColor('red')">
                        <div class="color-red-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-red-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/flame.svg" class="w-10 h-10 text-white" alt="Red">
                        </div>
                        <p class="text-center font-medium">红色</p>
                    </div>
                    <div class="color-option" id="color-green" :class="{ selected: state.selectedColor === 'green', 'disabled-option': isColorDisabled('green') }" @click="selectColor('green')">
                        <div class="color-green-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-green-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/leaf.svg" class="w-10 h-10 text-white" alt="Green">
                        </div>
                        <p class="text-center font-medium">绿色</p>
                    </div>
                    <div class="color-option" id="color-blue" :class="{ selected: state.selectedColor === 'blue', 'disabled-option': isColorDisabled('blue') }" @click="selectColor('blue')">
                        <div class="color-blue-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-blue-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/droplets.svg" class="w-10 h-10 text-white" alt="Blue">
                        </div>
                        <p class="text-center font-medium">蓝色</p>
                    </div>
                </div>

                <div class="glass rounded-xl p-4 mb-8">
                     <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                     <div class="space-y-3">
                         <div v-for="member in state.currentTeamMembers" :key="member.nickname + member.color" class="flex items-center">
                             <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                 <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                             </div>
                             <div>
                                 <p class="font-medium">{{ member.nickname }}</p>
                                 <p class="text-xs text-gray-400">
                                     <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                     <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                 </p>
                             </div>
                         </div>
                          <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm">暂无其他成员</div>
                     </div>
                 </div>

                <button @click="showStep(3)" :disabled="!state.selectedColor" :class="{'opacity-50 cursor-not-allowed': !state.selectedColor}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <button @click="showStep(1)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回
                </button>

            </div>

            <!-- Step 3: Job Selection -->
            <div id="step-job-selection" class="glass rounded-3xl p-8" v-show="state.currentStep === 3">
                 <!-- ... step 3 unchanged ... -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的职业</h1>
                    <p class="text-purple-300">每个队伍中的成员需要选择不同的职业</p>
                </div>
                <!-- ... Team Info, Color Info, Job Options, Member List, Buttons ... -->
                 <div class="glass rounded-xl p-4 mb-8">
                    <div class="flex items-center">
                        <div class="bg-purple-600 rounded-full p-2 mr-3">
                            <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                        </div>
                        <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                        </div>
                    </div>
                </div>
                 <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">你的颜色</h3>
                    <div class="flex items-center">
                        <div :class="`color-${state.selectedColor}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                             <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(state.selectedColor)">
                        </div>
                        <p class="font-medium">{{ getColorText(state.selectedColor) }}</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4 mb-8">
                     <!-- Job options -->
                     <div class="job-option" id="job-attacker" :class="{ selected: state.selectedJob === 'attacker', 'disabled-option': isJobDisabled('attacker') }" @click="selectJob('job-attacker')">
                         <div class="job-attacker-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                             <img src="https://unpkg.com/lucide-static@latest/icons/swords.svg" class="w-10 h-10 text-white" alt="Attacker">
                         </div>
                         <p class="text-center font-medium">攻击手</p>
                     </div>
                     <div class="job-option" id="job-defender" :class="{ selected: state.selectedJob === 'defender', 'disabled-option': isJobDisabled('defender') }" @click="selectJob('job-defender')">
                         <div class="job-defender-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                             <img src="https://unpkg.com/lucide-static@latest/icons/shield.svg" class="w-10 h-10 text-white" alt="Defender">
                         </div>
                         <p class="text-center font-medium">防御手</p>
                     </div>
                     <div class="job-option" id="job-supporter" :class="{ selected: state.selectedJob === 'supporter', 'disabled-option': isJobDisabled('supporter') }" @click="selectJob('job-supporter')">
                         <div class="job-supporter-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                             <img src="https://unpkg.com/lucide-static@latest/icons/heart-pulse.svg" class="w-10 h-10 text-white" alt="Supporter">
                         </div>
                         <p class="text-center font-medium">辅助手</p>
                     </div>
                 </div>
                 <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                         <div v-for="member in state.currentTeamMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                             <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                 <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                             </div>
                             <div>
                                 <p class="font-medium">{{ member.nickname }}</p>
                                 <p class="text-xs text-gray-400">
                                     <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                     <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                 </p>
                             </div>
                         </div>
                          <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm">暂无其他成员</div>
                     </div>
                 </div>

                 <button @click="showStep(4)" :disabled="!state.selectedJob" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <button @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回
                </button>
            </div>

            <!-- Step 4: Personal Info (with Avatar Upload) -->
            <div id="step-personal-info" class="glass rounded-3xl p-8" v-show="state.currentStep === 4">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">个人信息</h1>
                    <p class="text-purple-300">请填写你的个人信息完成注册</p>
                </div>

                <!-- Summary Section (Unchanged) -->
                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">你的选择</h3>
                    <div class="flex items-center justify-around space-x-4">
                        <!-- Team Summary -->
                        <div class="flex flex-col items-center">
                            <div class="bg-purple-600 rounded-full p-2 mb-1">
                                <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-4 h-4 text-white" alt="Team">
                            </div>
                            <p class="text-xs text-center">{{ state.teamName || '队伍名称' }}</p>
                        </div>
                        <!-- Color Summary -->
                        <div class="flex flex-col items-center">
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full p-2 mb-1">
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(state.selectedColor)">
                            </div>
                            <p class="text-xs text-center">{{ getColorText(state.selectedColor) }}</p>
                        </div>
                        <!-- Job Summary -->
                        <div class="flex flex-col items-center">
                            <div class="bg-pink-500 rounded-full p-2 mb-1"> <!-- Consider making job bg dynamic too? -->
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(state.selectedJob)}.svg`" class="w-4 h-4 text-white" :alt="getJobText(state.selectedJob)">
                            </div>
                            <p class="text-xs text-center">{{ getJobText(state.selectedJob) }}</p>
                        </div>
                    </div>
                </div>

                <!-- Form for Personal Info -->
                <form @submit.prevent="handleSubmitPersonalInfo" class="mb-8">

                    <!-- Avatar Upload Section -->
                    <div class="mb-6 text-center">
                        <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选)</label>
                        <div class="flex flex-col items-center">
                            <!-- Hidden file input -->
                            <input type="file" id="avatar-upload-input" accept="image/png, image/jpeg, image/gif, image/webp" @change="handleAvatarChange" class="hidden">

                            <!-- Avatar Preview / Placeholder -->
                             <div class="w-24 h-24 rounded-full bg-gray-700 mb-3 flex items-center justify-center overflow-hidden border-2 border-gray-600">
                                <img v-if="state.avatarPreview" :src="state.avatarPreview" alt="Avatar Preview" class="w-full h-full object-cover">
                                <img v-else src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-12 h-12 text-gray-400" alt="Avatar Placeholder">
                             </div>

                            <!-- Upload Button -->
                            <button type="button" @click="triggerAvatarUpload" class="text-sm bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 transition duration-300">
                                选择图片
                            </button>

                            <p class="mt-2 text-xs text-gray-400">支持 JPG, PNG, GIF, WebP (最大 2MB)</p>
                        </div>
                    </div>

                    <!-- Maimai ID -->
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID*</label>
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你的舞萌游戏ID</p>
                    </div>

                    <!-- Nickname -->
                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼*</label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：小明" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你希望被称呼的名字</p>
                    </div>

                    <!-- QQ Number -->
                    <div class="mb-4">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号*</label>
                        <input type="text" id="qq-number" v-model="state.qqNumber" required placeholder="例如：123456789" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">用于队伍联系</p>
                    </div>

                    <!-- Privacy Agreement -->
                    <div class="mb-6">
                        <label class="flex items-start">
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2">
                            <span class="text-xs text-gray-300">我已阅读并同意<a href="#" class="text-purple-400 hover:underline">隐私政策*</a>，并允许收集和使用我的信息用于组队目的。</span>
                        </label>
                    </div>

                    <!-- Buttons -->
                    <button type="submit" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                        提交信息并加入队伍
                    </button>
                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 5: Completion Page (with QR Code) -->
            <div id="step-completion" class="glass rounded-3xl p-8" v-show="state.currentStep === 5">
                 <!-- Progress Bar (Completed) -->
                 <div class="mb-8">
                    <div class="flex justify-between text-xs text-gray-400 mb-2">
                        <span>组队码</span>
                        <span>颜色</span>
                        <span>职业</span>
                        <span class="text-white font-bold">完成</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width: 100%;"></div></div>
                </div>

                 <!-- Header -->
                <div class="text-center mb-8">
                    <div class="w-24 h-24 bg-purple-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-12 h-12 text-white" alt="Success">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">注册成功！</h1>
                    <p class="text-purple-300">感谢你的填写，你已成功加入队伍</p>
                </div>

                <!-- Team Info -->
                <div class="glass rounded-xl p-4 mb-8">
                     <div class="flex items-center">
                        <div class="bg-purple-600 rounded-full p-2 mr-3">
                            <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                        </div>
                        <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ state.completionAllMembers.length }}/3</p>
                        </div>
                    </div>
                </div>

                <!-- Member List -->
                <div class="glass rounded-xl p-4 mb-8">
                     <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                        <!-- Assuming API returns member data including avatar_url -->
                        <div v-for="member in state.completionAllMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                             <!-- Avatar (Use placeholder if no avatar_url) -->
                             <div class="rounded-full w-8 h-8 flex items-center justify-center mr-3 bg-gray-700 overflow-hidden border border-gray-600">
                                <img v-if="member.avatar_url" :src="member.avatar_url" alt="Member Avatar" class="w-full h-full object-cover">
                                <img v-else src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-gray-400" alt="Member Placeholder">
                             </div>
                             <!-- Member Info -->
                             <div>
                                 <p class="font-medium">{{ member.nickname }} <span v-if="member.maimai_id === state.maimaiId || member.maimaiId === state.maimaiId">(你)</span></p> <!-- Adjust comparison based on API response key -->
                                 <p class="text-xs text-gray-400">
                                     <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                     <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                 </p>
                             </div>
                         </div>
                    </div>
                </div>

                 <!-- Sharing Section -->
                <div class="mb-8">
                    <h3 class="text-center font-medium mb-4">邀请更多好友加入</h3>

                    <!-- QR Code Generation -->
                    <div class="qr-code mb-4">
                         <qrcode-vue v-if="shareUrl" :value="shareUrl" :size="100" level="H" render-as="svg" background="#FFFFFF" foreground="#000000"/>
                         <p v-else class="text-xs text-gray-600">无法生成二维码</p>
                    </div>

                    <!-- Share Link Input & Copy -->
                    <div class="flex mb-4">
                        <input type="text" id="shareLink" readonly :value="shareUrl" class="share-link w-full rounded-l-lg py-3 px-4 text-white focus:outline-none">
                        <button id="copyBtn" @click="copyShareLink" class="bg-purple-700 hover:bg-purple-600 rounded-r-lg px-4 transition">
                            <img src="https://unpkg.com/lucide-static@latest/icons/copy.svg" class="w-5 h-5 text-white" alt="Copy">
                        </button>
                    </div>

                    <!-- Placeholder Share Buttons -->
                    <div class="flex space-x-2">
                        <button class="flex-1 flex items-center justify-center bg-blue-500 hover:bg-blue-600 rounded-lg py-2 transition">
                            <img src="https://unpkg.com/lucide-static@latest/icons/message-circle.svg" class="w-5 h-5 text-white mr-2" alt="QQ">
                            <span>QQ</span>
                        </button>
                        <button class="flex-1 flex items-center justify-center bg-green-500 hover:bg-green-600 rounded-lg py-2 transition">
                            <img src="https://unpkg.com/lucide-static@latest/icons/message-square.svg" class="w-5 h-5 text-white mr-2" alt="WeChat">
                            <span>微信</span>
                        </button>
                    </div>
                </div>

                <button @click="goHome" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回首页
                </button>
            </div>

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8">
                <p>© 2024 MPAM-Lab | {{ websiteLink.replace('https://','').replace('http://','') }}</p> <!-- Display domain from env var -->
            </div>

        </div> <!-- End Container -->

         <!-- Modals (Unchanged) -->
         <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50" v-show="state.showConfirmModal"> /* ... */ </div>
         <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50" v-show="state.showCreateModal"> /* ... */ </div>

        <!-- Loading Overlay (Unchanged) -->
        <div class="loading-overlay z-50" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p>处理中，请稍候...</p>
        </div>

         <!-- Celebration Container (Unchanged) -->
        <div class="celebration z-0" id="celebration"></div>

    </div> <!-- End Root container -->
</template>

<style scoped>
/* Custom styles from previous HTML */
/* Keeping glass and glow effects */
.glass {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px); /* Safari */
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
}
.input-code {
    letter-spacing: 0.5em;
    font-weight: bold;
    text-align: center;
}
.btn-glow {
    box-shadow: 0 0 15px rgba(124, 58, 237, 0.5);
    transition: all 0.3s ease;
}
.btn-glow:hover {
    box-shadow: 0 0 25px rgba(124, 58, 237, 0.8);
    transform: translateY(-2px);
}
.fade-in {
    animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}
.color-option, .job-option {
    transition: all 0.3s ease;
    cursor: pointer;
    position: relative; /* Needed for ::after */
    border-radius: 1rem; /* Match container border */
    padding: 0.5rem; /* Add some padding */
    border: 2px solid transparent; /* Placeholder for selected border */
}
.color-option:not(.disabled-option):hover, .job-option:not(.disabled-option):hover {
    transform: translateY(-5px);
    background-color: rgba(255, 255, 255, 0.05);
}
.color-option.selected, .job-option.selected {
    /* transform: scale(1.02); */
    /* box-shadow: 0 0 15px rgba(124, 58, 237, 0.8); */
    border-color: #a78bfa; /* Highlight border on select */
    background-color: rgba(167, 139, 250, 0.1);
}
/* Background gradients for colors */
.color-red-bg { background: linear-gradient(135deg, #ff5f6d, #ff0844); }
.color-green-bg { background: linear-gradient(135deg, #00b09b, #00d084); }
.color-blue-bg { background: linear-gradient(135deg, #4facfe, #00f2fe); }
/* Shadows for color options */
.color-red-shadow { box-shadow: 0 10px 20px rgba(255, 8, 68, 0.3); }
.color-green-shadow { box-shadow: 0 10px 20px rgba(0, 208, 132, 0.3); }
.color-blue-shadow { box-shadow: 0 10px 20px rgba(79, 172, 254, 0.3); }

/* Background gradients for jobs */
.job-attacker-bg { background: linear-gradient(135deg, #ff9a9e, #fad0c4); }
.job-defender-bg { background: linear-gradient(135deg, #a1c4fd, #c2e9fb); }
.job-supporter-bg { background: linear-gradient(135deg, #d4fc79, #96e6a1); }

.progress-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
}
.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #a78bfa, #8b5cf6);
    border-radius: 2px;
    transition: width 0.5s ease-in-out;
}
.disabled-option {
    opacity: 0.4; /* Dim more */
    cursor: not-allowed;
    pointer-events: none; /* Disable clicks */
    position: relative;
}
.disabled-option::after {
    content: "已被选"; /* Shorter text */
    position: absolute;
    bottom: 5px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px; /* Smaller font */
    color: white;
    white-space: nowrap;
    z-index: 1; /* Make sure it's above icon */
}
.color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 4px;
    vertical-align: middle; /* Align better with text */
}
.form-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}
.form-input:focus {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.3);
}
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 100; /* Make sure it's above modals */
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: white;
    text-align: center;
    backdrop-filter: blur(5px); /* Add blur effect */
    -webkit-backdrop-filter: blur(5px);
}
.spinner {
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    border-top: 4px solid #8b5cf6;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin-bottom: 16px;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.confetti {
    position: fixed;
    width: 10px;
    height: 10px;
    animation: confetti 5s ease-in-out infinite;
    z-index: 1; /* Above background, below content */
}
@keyframes confetti {
    0% {
        transform: translateY(0) rotate(0deg);
        opacity: 1;
    }
    100% {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
    }
}
.qr-code {
    background: white; /* Ensure white background for QR code readability */
    padding: 10px; /* Adjust padding as needed */
    border-radius: 8px;
    width: 120px; /* Container size matches QR code size + padding */
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}
/* Ensure QR code SVG scales if needed */
.qr-code > svg {
    display: block;
    width: 100%;
    height: 100%;
}

.share-link {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
    /* Prevent text selection highlight */
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
}
.celebration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0; /* Behind everything except background */
    overflow: hidden; /* Prevent confetti causing scroll */
}

/* Responsive adjustments */
@media (min-width: 640px) {
    .container {
        max-width: 26rem; /* Slightly adjusted max-width */
    }
}
/* Remove the problematic global overflow hidden */
/* html, body {
    overflow: hidden;
} */

/* Ensure form elements have consistent background in dark mode */
input[type="text"], input[type="checkbox"], input[type="file"], button {
     color-scheme: dark; /* Hint for browser styling */
}
input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    accent-color: #8b5cf6; /* Style checkbox color */
}
</style>