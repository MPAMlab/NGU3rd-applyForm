<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

// --- Configuration ---
// Replace with your actual Cloudflare Worker API endpoint URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api'; // Default for local testing

// --- State Management (Reactive) ---
const state = reactive({
    currentStep: 1,
    teamCode: null,
    teamName: null,
    isNewTeam: false, // True if creating a new team
    newTeamName: null, // Input for new team name
    selectedColor: null, // 'red', 'green', or 'blue'
    selectedJob: null, // 'attacker', 'defender', or 'supporter' (Storing just the type now)
    maimaiId: null,
    nickname: null,
    qqNumber: null,
    privacyAgreed: false,

    // UI State
    showConfirmModal: false,
    showCreateModal: false,
    showLoadingOverlay: false,
    errorMessage: null, // To display API errors

    // Data fetched from API
    currentTeamMembers: [], // Members of the team the user is joining/creating
    completionAllMembers: [], // All members including the newly added one for the final step

    confettiInterval: null, // To store interval ID for cleanup
});

// --- Computed Properties ---
const progressWidth = computed(() => {
    const stepProgress = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };
    return `${stepProgress[state.currentStep]}%`;
});

// Check if a color is disabled based on current team members
const isColorDisabled = computed(() => (color) => {
    return state.currentTeamMembers.some(member => member.color === color);
});

// Check if a job is disabled based on current team members
const isJobDisabled = computed(() => (jobType) => {
     // Storing job as type ('attacker') in state/backend, converting from 'job-attacker' ID
    return state.currentTeamMembers.some(member => member.job === jobType);
});


// --- Methods / Functions ---

// Function to navigate between steps
function showStep(stepNumber) {
    // Clean up confetti animation when leaving the completion step
    if (state.currentStep === 5 && state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
        const celebrationDiv = document.getElementById('celebration');
        if(celebrationDiv) celebrationDiv.innerHTML = ''; // Clear confetti elements from DOM
    }

    state.currentStep = stepNumber;
    state.errorMessage = null; // Clear error message on step change

    // Trigger confetti animation when entering the completion step
    if (stepNumber === 5) {
         setTimeout(() => {
             createConfetti();
             state.confettiInterval = setInterval(createConfetti, 2000);
         }, 100); // Small delay
    }
}

// Handles the logic when the user enters a team code and clicks "Continue"
async function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null; // Clear previous errors

    if (code.length !== 4 || isNaN(parseInt(code))) {
        state.errorMessage = '请输入4位数字的组队码';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
             // Handle API errors (e.g., 400 Invalid format, though frontend validates)
             state.errorMessage = data.error || '检查队伍失败';
             return;
        }

        if (data.exists) {
            // Team exists, update state with fetched info
            state.teamName = data.name;
            state.currentTeamMembers = data.members || []; // Update members list
            state.isNewTeam = false;
            state.showConfirmModal = true; // Show confirmation modal
        } else {
            // Team does not exist, prepare for creation
            state.teamName = null; // Clear previous team name
            state.currentTeamMembers = []; // No members yet
            state.isNewTeam = true;
            state.showCreateModal = true; // Show create team modal
        }

    } catch (e) {
        console.error('API Error checking team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// Handles confirming joining an existing team
function confirmJoinTeam() {
    // Data (teamName, currentTeamMembers) is already loaded from handleContinue
    state.showConfirmModal = false; // Close the modal
    showStep(2); // Proceed to the color selection step
}

// Handles creating a new team
async function createNewTeam() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null; // Clear previous errors

    if (!name) {
        state.errorMessage = '请输入队伍名称';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code, name }),
        });

        const data = await response.json();

        if (!response.ok) {
             state.errorMessage = data.error || '创建队伍失败';
             return;
        }

        // Team created successfully, update state and proceed
        state.teamName = data.name; // Use the name returned by API
        state.currentTeamMembers = []; // Newly created team has no members yet
        state.showCreateModal = false; // Close the modal
        showStep(2); // Proceed to the color selection step

    } catch (e) {
        console.error('API Error creating team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// Handles selecting a color
function selectColor(color) {
    // Frontend check (backend will also validate)
    if (!isColorDisabled.value(color)) {
        state.selectedColor = color;
    }
}

// Helper function to get the display text for a color ID
function getColorText(colorId) {
     switch(colorId) {
         case 'red': return '红色';
         case 'green': return '绿色';
         case 'blue': return '蓝色';
         default: return '';
     }
}

// Helper function to get the Lucide icon name for a color ID
function getColorIcon(colorId) {
     switch(colorId) {
         case 'red': return 'flame';
         case 'green': return 'leaf';
         case 'blue': return 'droplets';
         default: return 'help-circle';
     }
}

// Handles selecting a job
function selectJob(jobId) {
     // Frontend check (backend will also validate)
     const jobType = jobId.replace('job-', '');
    if (!isJobDisabled.value(jobType)) {
        state.selectedJob = jobType; // Store just the type ('attacker')
    }
}

// Helper function to get the display text for a job ID/type
function getJobText(jobType) {
     switch(jobType) {
         case 'attacker': return '攻击手';
         case 'defender': return '防御手';
         case 'supporter': return '辅助手';
         default: return '';
     }
}

// Helper function to get the Lucide icon name for a job ID/type
function getJobIcon(jobType) {
     switch(jobType) {
         case 'attacker': return 'swords';
         case 'defender': return 'shield';
         case 'supporter': return 'heart-pulse';
         default: return 'help-circle';
     }
}


// Handles submitting the personal information form
async function handleSubmitPersonalInfo() {
    state.errorMessage = null; // Clear previous errors

    // Basic form validation
    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私政策';
        return;
    }
     if (!state.selectedColor || !state.selectedJob) {
         state.errorMessage = '请选择颜色和职业'; // Should not happen if flow is correct
         return;
     }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                teamCode: state.teamCode,
                color: state.selectedColor,
                job: state.selectedJob, // Use the stored type
                maimaiId: state.maimaiId.trim(),
                nickname: state.nickname.trim(),
                qqNumber: state.qqNumber.trim(),
            }),
        });

        const data = await response.json();

        if (!response.ok) {
             // Handle specific API errors (e.g., 409 Conflict for color/job taken, 404 team not found, 409 team full)
             state.errorMessage = data.error || '提交信息失败';
             return;
        }

        // Success! Update state with the final member list from the API
        state.completionAllMembers = data.members || []; // API should return the updated list
        state.teamName = data.name; // API should return the team name
        showStep(5); // Proceed to the completion page

    } catch (e) {
        console.error('API Error joining team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// Handles copying the share link to the clipboard
function copyShareLink() {
    const shareLinkInput = document.getElementById('shareLink');
    if (shareLinkInput) {
        shareLinkInput.select();
        shareLinkInput.setSelectionRange(0, 99999);

        try {
            navigator.clipboard.writeText(shareLinkInput.value).then(() => {
                 // Success feedback
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
                 // Fallback for older browsers or if clipboard API fails
                 try {
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

        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('复制失败，请手动复制链接。');
        }
    }
}

// Handles navigating back to the first step and resetting state
function goHome() {
    // Reset all relevant state variables
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
    state.showConfirmModal = false;
    state.showCreateModal = false;
    state.showLoadingOverlay = false;
    state.errorMessage = null;
    state.currentTeamMembers = [];
    state.completionAllMembers = [];

    // Clear any URL parameters related to the team code
    history.replaceState({}, document.title, window.location.pathname);

    showStep(1); // Navigate back to the first step
}

// Confetti animation function (can remain mostly as raw JS, triggered by Vue)
function createConfetti() {
    const celebrationDiv = document.getElementById('celebration');
    if (!celebrationDiv) return;

    const confettiCount = 20;
    const colors = ['#ff5f6d', '#00b09b', '#4facfe', '#a78bfa', '#fcd34d'];

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');

        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = randomColor;

        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = -20 + 'px';

        const size = Math.random() * 10 + 5;
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';

        const duration = Math.random() * 3 + 2;
        confetti.style.animationDuration = duration + 's';

        const delay = Math.random() * 2;
        confetti.style.animationDelay = delay + 's';

        celebrationDiv.appendChild(confetti);

        confetti.addEventListener('animationend', () => {
             confetti.remove();
        });
    }
}


// --- Lifecycle Hooks ---

onMounted(() => {
    // Check URL for pre-filled team code when the page loads
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');

    if (codeParam && codeParam.length === 4 && !isNaN(parseInt(codeParam))) {
        state.teamCode = codeParam;
        // Automatically trigger check if code is in URL
        handleContinue();
    }

    // Ensure the correct initial step is displayed
    // This might be redundant if handleContinue is called, but safe fallback
    showStep(state.currentStep);
});

onUnmounted(() => {
    // Clean up the confetti animation interval
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
});

</script>

<template>
    <!-- Root container with a simple background color -->
    <div class="bg-gray-900 text-white min-h-screen flex items-center justify-center px-4 py-8 overflow-y-auto">

        <div class="container max-w-sm mx-auto w-full"> <!-- Increased max-width slightly for better desktop look -->

            <!-- Progress Bar (Visible on steps 2-4) -->
            <div class="mb-8" v-if="state.currentStep > 1 && state.currentStep < 5">
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
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的颜色</h1>
                    <p class="text-purple-300">每个队伍中的成员需要选择不同的颜色</p>
                </div>

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
                    <div class="color-option"
                         id="color-red"
                         :class="{ selected: state.selectedColor === 'red', 'disabled-option': isColorDisabled('red') }"
                         @click="selectColor('red')">
                        <div class="color-red-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-red-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/flame.svg" class="w-10 h-10 text-white" alt="Red">
                        </div>
                        <p class="text-center font-medium">红色</p>
                    </div>

                    <div class="color-option"
                         id="color-green"
                         :class="{ selected: state.selectedColor === 'green', 'disabled-option': isColorDisabled('green') }"
                         @click="selectColor('green')">
                        <div class="color-green-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-green-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/leaf.svg" class="w-10 h-10 text-white" alt="Green">
                        </div>
                        <p class="text-center font-medium">绿色</p>
                    </div>

                    <div class="color-option"
                         id="color-blue"
                         :class="{ selected: state.selectedColor === 'blue', 'disabled-option': isColorDisabled('blue') }"
                         @click="selectColor('blue')">
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
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的职业</h1>
                    <p class="text-purple-300">每个队伍中的成员需要选择不同的职业</p>
                </div>

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
                    <div class="job-option"
                         id="job-attacker"
                         :class="{ selected: state.selectedJob === 'attacker', 'disabled-option': isJobDisabled('attacker') }"
                         @click="selectJob('job-attacker')">
                        <div class="job-attacker-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                            <img src="https://unpkg.com/lucide-static@latest/icons/swords.svg" class="w-10 h-10 text-white" alt="Attacker">
                        </div>
                        <p class="text-center font-medium">攻击手</p>
                    </div>

                    <div class="job-option"
                         id="job-defender"
                         :class="{ selected: state.selectedJob === 'defender', 'disabled-option': isJobDisabled('defender') }"
                         @click="selectJob('job-defender')">
                        <div class="job-defender-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                            <img src="https://unpkg.com/lucide-static@latest/icons/shield.svg" class="w-10 h-10 text-white" alt="Defender">
                        </div>
                        <p class="text-center font-medium">防御手</p>
                    </div>

                    <div class="job-option"
                         id="job-supporter"
                         :class="{ selected: state.selectedJob === 'supporter', 'disabled-option': isJobDisabled('supporter') }"
                         @click="selectJob('job-supporter')">
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

            <!-- Step 4: Personal Info -->
            <div id="step-personal-info" class="glass rounded-3xl p-8" v-show="state.currentStep === 4">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">个人信息</h1>
                    <p class="text-purple-300">请填写你的个人信息完成注册</p>
                </div>

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
                            <div class="bg-pink-500 rounded-full p-2 mb-1">
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(state.selectedJob)}.svg`" class="w-4 h-4 text-white" :alt="getJobText(state.selectedJob)">
                            </div>
                            <p class="text-xs text-center">{{ getJobText(state.selectedJob) }}</p>
                        </div>
                    </div>
                </div>

                <form @submit.prevent="handleSubmitPersonalInfo" class="mb-8">
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID</label>
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你的舞萌游戏ID</p>
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼</label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：小明" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你希望被称呼的名字</p>
                    </div>

                    <div class="mb-4">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号</label>
                        <input type="text" id="qq-number" v-model="state.qqNumber" required placeholder="例如：123456789" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">用于队伍联系</p>
                    </div>

                    <div class="mb-6">
                        <label class="flex items-start">
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2">
                            <span class="text-xs text-gray-300">我已阅读并同意<a href="#" class="text-purple-400 hover:underline">隐私政策</a>，并允许收集和使用我的信息用于组队目的。</span>
                        </label>
                    </div>

                    <button type="submit" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                        提交
                    </button>

                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 5: Completion Page -->
            <div id="step-completion" class="glass rounded-3xl p-8" v-show="state.currentStep === 5">
                 <div class="mb-8">
                    <div class="flex justify-between text-xs text-gray-400 mb-2">
                        <span>组队码</span>
                        <span>颜色</span>
                        <span>职业</span>
                        <span class="text-white font-bold">完成</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width: 100%;"></div></div>
                </div>

                <div class="text-center mb-8">
                    <div class="w-24 h-24 bg-purple-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-12 h-12 text-white" alt="Success">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">注册成功！</h1>
                    <p class="text-purple-300">感谢你的填写，你已成功加入队伍</p>
                </div>

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

                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                        <div v-for="member in state.completionAllMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                             <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                            </div>
                            <div>
                                <p class="font-medium">{{ member.nickname }} <span v-if="member.maimai_id === state.maimaiId">(你)</span></p> <!-- Identify current user by maimaiId -->
                                <p class="text-xs text-gray-400">
                                    <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                    <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-8">
                    <h3 class="text-center font-medium mb-4">邀请更多好友加入</h3>

                    <div class="qr-code mb-4">
                        <!-- QR Code Placeholder - In a real app, generate this based on state.teamCode -->
                         <!-- You could use a library like 'qrcode.vue' here -->
                        <img src="https://unpkg.com/lucide-static@latest/icons/qr-code.svg" class="w-16 h-16 text-black" alt="QR Code">
                    </div>

                    <div class="flex mb-4">
                        <!-- Share link input with dynamic value -->
                        <!-- Replace 'your-frontend-domain.com' with your actual domain -->
                        <input type="text" id="shareLink" readonly :value="`https://your-frontend-domain.com/?code=${state.teamCode}`" class="share-link w-full rounded-l-lg py-3 px-4 text-white focus:outline-none">
                        <!-- Copy button -->
                        <button id="copyBtn" @click="copyShareLink" class="bg-purple-700 hover:bg-purple-600 rounded-r-lg px-4 transition">
                            <img src="https://unpkg.com/lucide-static@latest/icons/copy.svg" class="w-5 h-5 text-white" alt="Copy">
                        </button>
                    </div>

                    <div class="flex space-x-2">
                        <!-- Placeholder share buttons -->
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
                <p>© 2023 MPAM-Lab | your-frontend-domain.com</p> <!-- Update domain -->
            </div>

        </div>

        <!-- Modals -->
        <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍，该队伍目前有 {{ state.currentTeamMembers.length }} 名成员。</p>
                <div class="flex space-x-4">
                    <button @click="state.showConfirmModal = false" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition">
                        返回修改
                    </button>
                    <button @click="confirmJoinTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow">
                        确认加入
                    </button>
                </div>
            </div>
        </div>

        <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50" v-show="state.showCreateModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in">
                <h3 class="text-xl font-bold mb-4">创建新队伍</h3>
                <p class="mb-4 text-sm text-gray-300">这个组队码尚未使用，请为你的队伍取个名字</p>
                <div class="mb-6">
                    <label for="newTeamName" class="block text-sm font-medium text-purple-300 mb-2">队伍名称</label>
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：闪耀星辰" class="w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500">
                </div>
                <div class="flex space-x-4">
                    <button @click="state.showCreateModal = false" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition">
                        返回
                    </button>
                    <button @click="createNewTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow">
                        创建队伍
                    </button>
                </div>
            </div>
        </div>

        <!-- Loading Overlay -->
        <div class="loading-overlay z-50" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p>处理中，请稍候...</p>
        </div>

         <!-- Celebration Container (Confetti will be added here by JS) -->
        <div class="celebration z-0" id="celebration"></div>

    </div>
</template>

<style scoped>
/* Custom styles from previous HTML */
/* Keeping glass and glow effects */
.glass {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
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
    from { opacity: 0; }
    to { opacity: 1; }
}
.color-option, .job-option {
    transition: all 0.3s ease;
    cursor: pointer; /* Add pointer cursor */
}
.color-option:not(.disabled-option):hover, .job-option:not(.disabled-option):hover {
    transform: translateY(-5px);
}
.color-option.selected, .job-option.selected {
    transform: scale(1.05);
    box-shadow: 0 0 15px rgba(124, 58, 237, 0.8); /* Add glow on select */
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
    opacity: 0.5;
    cursor: not-allowed;
    position: relative;
    pointer-events: none; /* Disable clicks */
}
.disabled-option::after {
    content: "已选择";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.7);
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    color: white;
    white-space: nowrap;
}
.color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 4px;
    /* Background controlled by class binding */
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
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: white;
    text-align: center;
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
    /* Background color set by JS */
    animation: confetti 5s ease-in-out infinite;
    z-index: -1; /* Behind other content */
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
    background: white;
    padding: 16px;
    border-radius: 8px;
    width: 128px;
    height: 128px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
}
.share-link {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}
.celebration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0; /* Behind modals, above background */
}

/* Responsive adjustments */
/* On screens larger than sm (640px), increase max-width slightly */
@media (min-width: 640px) {
    .container {
        max-width: 28rem; /* Tailwind's max-w-sm is 24rem, max-w-md is 28rem */
    }
}
/* Ensure body doesn't scroll if content is taller than viewport */
/* The main container has overflow-y-auto */
html, body {
    overflow: hidden; /* Prevent body scrolling */
}
</style>