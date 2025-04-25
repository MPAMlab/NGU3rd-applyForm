<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';

// --- State Management (Reactive) ---
// Using reactive for a complex state object
const state = reactive({
    currentStep: 1,
    teamCode: null,
    teamName: null,
    isNewTeam: false, // True if creating a new team
    newTeamName: null, // Input for new team name
    selectedColor: null, // 'red', 'green', or 'blue'
    selectedJob: null, // 'job-attacker', 'job-defender', 'job-supporter'
    maimaiId: null,
    nickname: null,
    qqNumber: null,
    privacyAgreed: false,
    showConfirmModal: false,
    showCreateModal: false,
    showLoadingOverlay: false,
    confettiInterval: null, // To store interval ID for cleanup
    // Simulated existing data (for demonstration purposes only)
    // In a real app, this data would come from your Cloudflare Worker API
    existingTeams: {
        '1234': { name: '闪耀星辰', members: [
            { color: 'green', job: 'defender', nickname: '小明' },
            { color: 'blue', job: 'supporter', nickname: '小红' }
        ]},
        '5678': { name: '星光战队', members: [
             { color: 'red', job: 'attacker', nickname: '老王' }
        ]},
         '9012': { name: '宇宙歌姬', members: []}
    }
});

// --- Computed Properties ---
// Calculate progress bar width based on current step
const progressWidth = computed(() => {
    const stepProgress = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };
    return `${stepProgress[state.currentStep]}%`;
});

// Get members of the current team (excluding the user being registered until completion)
const currentTeamMembers = computed(() => {
    return state.existingTeams[state.teamCode]?.members || [];
});

// Calculate total members shown in steps 2-4 (existing + current user)
const totalMembers = computed(() => {
    // Only count the current user if they are past the first step and before completion
    return currentTeamMembers.value.length + (state.currentStep > 1 && state.currentStep < 5 ? 1 : 0);
});

// Calculate total members shown on the completion page (existing + the user who just joined)
const completionTotalMembers = computed(() => {
     // On the completion page, the user is considered part of the team
     return (state.existingTeams[state.teamCode]?.members.length || 0) + 1;
});

// Get the list of all members for the completion page (existing + the new user)
const completionAllMembers = computed(() => {
    // Combine existing members and the newly added user for the completion list
    // The new user's data comes from the state
    const newUser = {
        color: state.selectedColor,
        // Store job type only, remove 'job-' prefix
        job: state.selectedJob ? state.selectedJob.replace('job-', '') : null,
        nickname: state.nickname || '你', // Use entered nickname or default to "你"
        isCurrentUser: true // Flag to identify the user being registered
    };
    // Return existing members plus the new user
    return [...(state.existingTeams[state.teamCode]?.members || []), newUser];
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

    // Trigger confetti animation when entering the completion step
    if (stepNumber === 5) {
         // Use nextTick or a small timeout to ensure the DOM element for confetti exists
         // before trying to add confetti elements to it.
         setTimeout(() => {
             createConfetti();
             // Start interval for continuous confetti rain (optional)
             state.confettiInterval = setInterval(createConfetti, 2000);
         }, 100); // Small delay
    }
}

// Handles the logic when the user enters a team code and clicks "Continue"
function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';

    // Basic validation for the team code format
    if (code.length !== 4 || isNaN(code)) {
        alert('请输入4位数字的组队码');
        return;
    }

    // Check if the team code exists in our simulated data
    if (state.existingTeams[code]) {
        // Team exists, retrieve its info and show the confirmation modal
        state.teamName = state.existingTeams[code].name;
        state.showConfirmModal = true;
    } else {
        // Team does not exist, mark as new team and show the create team modal
        state.isNewTeam = true;
        state.showCreateModal = true;
    }
}

// Handles confirming joining an existing team
function confirmJoinTeam() {
    // In a real application, you would make an API call here to join the team.
    // The API would validate if the team is full, etc.
    state.showConfirmModal = false; // Close the modal
    state.isNewTeam = false; // Confirming joining an existing team
    showStep(2); // Proceed to the color selection step
}

// Handles creating a new team
function createNewTeam() {
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    // Validate the new team name
    if (!name) {
        alert('请输入队伍名称');
        return;
    }
    // In a real application, you would make an API call here to create the team.
    // The API would return confirmation and potentially the team details.
    state.teamName = name; // Save the new team name
    // Simulate adding the new team to our local data for subsequent steps
    state.existingTeams[state.teamCode] = { name: name, members: [] };
    state.showCreateModal = false; // Close the modal
    showStep(2); // Proceed to the color selection step
}

// Handles selecting a color
function selectColor(color) {
    // Check if the selected color is already taken by existing members
    const occupiedColors = currentTeamMembers.value.map(m => m.color);
    if (occupiedColors.includes(color)) {
        // This should ideally be prevented by disabling the UI element,
        // but this check adds robustness.
        console.warn(`Color ${color} is already taken.`);
        return; // Do nothing if the color is taken
    }
    state.selectedColor = color; // Update the selected color in state
}

// Helper function to determine if a color option should be disabled
function isColorDisabled(color) {
    const occupiedColors = currentTeamMembers.value.map(m => m.color);
    return occupiedColors.includes(color);
}

// Helper function to get the display text for a color ID
function getColorText(colorId) {
     switch(colorId) {
         case 'red': return '红色';
         case 'green': return '绿色';
         case 'blue': return '蓝色';
         default: return ''; // Handle unknown colors
     }
}

// Helper function to get the Lucide icon name for a color ID
function getColorIcon(colorId) {
     switch(colorId) {
         case 'red': return 'flame';
         case 'green': return 'leaf';
         case 'blue': return 'droplets';
         default: return 'help-circle'; // Default icon for unknown
     }
}

// Handles selecting a job
function selectJob(jobId) {
    // Check if the selected job is already taken by existing members
    const occupiedJobs = currentTeamMembers.value.map(m => m.job);
    const jobType = jobId.replace('job-', ''); // Get the job type ('attacker', 'defender', 'supporter')
     if (occupiedJobs.includes(jobType)) {
        // Safeguard
        console.warn(`Job ${jobType} is already taken.`);
        return; // Do nothing if the job is taken
    }
    state.selectedJob = jobId; // Update the selected job ID in state
}

// Helper function to determine if a job option should be disabled
function isJobDisabled(jobId) {
    const occupiedJobs = currentTeamMembers.value.map(m => m.job);
    const jobType = jobId.replace('job-', '');
    return occupiedJobs.includes(jobType);
}

// Helper function to get the display text for a job ID
function getJobText(jobId) {
     switch(jobId) {
         case 'job-attacker': return '攻击手';
         case 'job-defender': return '防御手';
         case 'job-supporter': return '辅助手';
         default: return ''; // Handle unknown jobs
     }
}

// Helper function to get the Lucide icon name for a job ID
function getJobIcon(jobId) {
     switch(jobId) {
         case 'job-attacker': return 'swords';
         case 'job-defender': return 'shield';
         case 'job-supporter': return 'heart-pulse';
         default: return 'help-circle'; // Default icon for unknown
     }
}


// Handles submitting the personal information form
function handleSubmitPersonalInfo() {
    // Basic form validation (using 'required' in template is good, but JS check is also needed)
    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        alert('请填写所有必填字段并同意隐私政策');
        return;
    }

    state.showLoadingOverlay = true; // Show loading indicator

    // Simulate an asynchronous API request to submit the user data
    setTimeout(() => {
        console.log("Submitting data:", {
            teamCode: state.teamCode,
            teamName: state.teamName,
            color: state.selectedColor,
            job: state.selectedJob ? state.selectedJob.replace('job-', '') : null, // Store just the job type
            maimaiId: state.maimaiId,
            nickname: state.nickname,
            qqNumber: state.qqNumber
        });

        // --- Simulate Backend Response ---
        // In a real app, the backend would process this and return success/failure.
        // Upon success, the backend would update the database and return the updated team info.

        // Simulate adding the new member to the local state for the completion page display
        // This is purely for frontend demonstration; the real update happens on the backend.
        if (state.existingTeams[state.teamCode]) {
             state.existingTeams[state.teamCode].members.push({
                 color: state.selectedColor,
                 job: state.selectedJob ? state.selectedJob.replace('job-', '') : null,
                 nickname: state.nickname
             });
        } else {
            // This case should ideally not happen if the flow is followed, but included for robustness
             state.existingTeams[state.teamCode] = {
                 name: state.teamName,
                 members: [{
                     color: state.selectedColor,
                     job: state.selectedJob ? state.selectedJob.replace('job-', '') : null,
                     nickname: state.nickname
                 }]
             };
        }
        // --- End Simulation ---

        state.showLoadingOverlay = false; // Hide loading indicator
        showStep(5); // Proceed to the completion page

    }, 1500); // Simulate network delay
}

// Handles copying the share link to the clipboard
function copyShareLink() {
    const shareLinkInput = document.getElementById('shareLink'); // Get the input element
    if (shareLinkInput) {
        shareLinkInput.select(); // Select the text in the input
        shareLinkInput.setSelectionRange(0, 99999); // For mobile devices

        try {
            // Execute the copy command
            document.execCommand('copy');

            // Optional: Provide visual feedback to the user
            const copyBtn = document.getElementById('copyBtn');
             if (copyBtn) {
                const originalIcon = copyBtn.innerHTML;
                copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="Copied">';
                setTimeout(() => {
                    copyBtn.innerHTML = originalIcon; // Restore original icon after a delay
                }, 2000);
             }
             // alert('链接已复制到剪贴板！'); // Or a more subtle notification
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('复制失败，请手动复制链接。');
        }
    }
}

// Handles navigating back to the first step and resetting state
function goHome() {
    // Reset all relevant state variables to their initial values
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

    // Clear any URL parameters related to the team code
    history.replaceState({}, document.title, window.location.pathname);

    showStep(1); // Navigate back to the first step
}

// Confetti animation function (can remain mostly as raw JS, triggered by Vue)
function createConfetti() {
    const celebrationDiv = document.getElementById('celebration');
    if (!celebrationDiv) return; // Ensure the container exists

    const confettiCount = 20; // Number of confetti pieces to create per call
    const colors = ['#ff5f6d', '#00b09b', '#4facfe', '#a78bfa', '#fcd34d']; // Array of colors

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');

        // Assign random color, position, size, duration, and delay
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = randomColor;

        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.top = -20 + 'px'; // Start above the viewport

        const size = Math.random() * 10 + 5; // Random size between 5px and 15px
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';

        const duration = Math.random() * 3 + 2; // Random animation duration between 2s and 5s
        confetti.style.animationDuration = duration + 's';

        const delay = Math.random() * 2; // Random animation delay between 0s and 2s
        confetti.style.animationDelay = delay + 's';

        celebrationDiv.appendChild(confetti); // Add confetti to the container

        // Clean up the confetti element after its animation finishes
        confetti.addEventListener('animationend', () => {
             confetti.remove();
        });
    }
}


// --- Lifecycle Hooks ---

// Code to run when the component is mounted to the DOM
onMounted(() => {
    // Check URL for pre-filled team code when the page loads
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');

    if (codeParam && codeParam.length === 4 && !isNaN(codeParam)) {
        state.teamCode = codeParam;
        // Optionally, you could automatically trigger the continue logic here
        // handleContinue(); // Be cautious with auto-triggering, it might be too fast
    }

    // Ensure the correct initial step is displayed
    showStep(state.currentStep);
});

// Code to run when the component is unmounted from the DOM
onUnmounted(() => {
    // Clean up the confetti animation interval to prevent memory leaks
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = ''; // Also clear any remaining elements
    }
});

</script>

<template>
    <!-- Root container with background styles -->
    <!-- Note: In a real Vue app, background styles might be in App.vue or a global CSS file -->
    <div class="bg-gray-900 text-white min-h-screen flex items-center justify-center px-4 py-8 box-border"
         style="background-image: url('https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1470'); background-size: cover; background-position: center; background-attachment: fixed;">

        <div class="container max-w-md mx-auto">

            <!-- Progress Bar (Visible on steps 2-4) -->
            <!-- Using v-if to conditionally render the progress bar based on step -->
            <div class="mb-8" v-if="state.currentStep > 1 && state.currentStep < 5">
                <div class="flex justify-between text-xs text-gray-400 mb-2">
                    <span>组队码</span>
                    <!-- Dynamically apply text color and boldness based on current step -->
                    <span :class="{'text-white font-bold': state.currentStep >= 2}">颜色</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 3}">职业</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 4}">个人信息</span>
                </div>
                <div class="progress-bar">
                    <!-- Progress fill width is bound to the computed property -->
                    <div class="progress-fill" :style="{ width: progressWidth }"></div>
                </div>
            </div>

            <!-- Step 1: Team Code Input -->
            <!-- Using v-show to toggle visibility without removing from DOM (good for simple toggles) -->
            <div id="step-team-code" class="glass rounded-3xl p-8 mb-8 fade-in" v-show="state.currentStep === 1">
                <div class="text-center mb-8">
                    <div class="w-24 h-24 bg-purple-600 rounded-full mx-auto flex items-center justify-center mb-4">
                        <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-12 h-12 text-white" alt="Team">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">舞萌队伍注册</h1>
                    <p class="text-purple-300">输入四位数组队码开始</p>
                </div>

                <div class="mb-8">
                    <label for="teamCode" class="block text-sm font-medium text-purple-300 mb-2">组队码</label>
                    <!-- v-model binds input value to state.teamCode -->
                    <input type="text" id="teamCode" v-model="state.teamCode" maxlength="4" placeholder="1234" class="input-code w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-4 px-6 text-2xl focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <p class="mt-2 text-xs text-gray-400">请输入四位数字的组队码</p>
                </div>

                <!-- @click handles button click event -->
                <button @click="handleContinue" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    继续
                </button>

                <p class="text-center text-sm text-gray-400">
                    没有组队码？系统将自动为你创建新队伍
                </p>
            </div>

            <!-- Step 2: Color Selection -->
            <div id="step-color-selection" class="glass rounded-3xl p-8 mb-8" v-show="state.currentStep === 2">
                 <!-- Progress Bar is handled outside this div -->

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
                            <!-- Display team info from state -->
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ totalMembers }}/3</p>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4 mb-8">
                    <!-- Color options -->
                    <!-- Use v-for if colors were dynamic, but static here -->
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
                        <!-- Loop through existing members to display them -->
                        <div v-for="member in currentTeamMembers" :key="member.nickname + member.color" class="flex items-center">
                            <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                            </div>
                            <div>
                                <p class="font-medium">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-400">
                                    <!-- Display color indicator and text -->
                                    <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                    <!-- Display job icon and text -->
                                    <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon('job-' + member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText('job-' + member.job)"> {{ getJobText('job-' + member.job) }}
                                </p>
                            </div>
                        </div>
                         <!-- Message if no other members -->
                         <div v-if="currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm">暂无其他成员</div>
                    </div>
                </div>

                <!-- Button to proceed to the next step (disabled if no color is selected) -->
                <button @click="showStep(3)" :disabled="!state.selectedColor" :class="{'opacity-50 cursor-not-allowed': !state.selectedColor}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>

                <!-- Button to go back to the previous step -->
                <button @click="showStep(1)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回
                </button>
            </div>

            <!-- Step 3: Job Selection -->
            <div id="step-job-selection" class="glass rounded-3xl p-8 mb-8" v-show="state.currentStep === 3">
                 <!-- Progress Bar is handled outside this div -->

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
                            <!-- Display team info from state -->
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ totalMembers }}/3</p>
                        </div>
                    </div>
                </div>

                 <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">你的颜色</h3>
                    <div class="flex items-center">
                        <!-- Display selected color -->
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
                         :class="{ selected: state.selectedJob === 'job-attacker', 'disabled-option': isJobDisabled('job-attacker') }"
                         @click="selectJob('job-attacker')">
                        <div class="job-attacker-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                            <img src="https://unpkg.com/lucide-static@latest/icons/swords.svg" class="w-10 h-10 text-white" alt="Attacker">
                        </div>
                        <p class="text-center font-medium">攻击手</p>
                    </div>

                    <div class="job-option"
                         id="job-defender"
                         :class="{ selected: state.selectedJob === 'job-defender', 'disabled-option': isJobDisabled('job-defender') }"
                         @click="selectJob('job-defender')">
                        <div class="job-defender-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center">
                            <img src="https://unpkg.com/lucide-static@latest/icons/shield.svg" class="w-10 h-10 text-white" alt="Defender">
                        </div>
                        <p class="text-center font-medium">防御手</p>
                    </div>

                    <div class="job-option"
                         id="job-supporter"
                         :class="{ selected: state.selectedJob === 'job-supporter', 'disabled-option': isJobDisabled('job-supporter') }"
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
                        <!-- Loop through existing members -->
                        <div v-for="member in currentTeamMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                            <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                            </div>
                            <div>
                                <p class="font-medium">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-400">
                                    <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                    <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon('job-' + member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText('job-' + member.job)"> {{ getJobText('job-' + member.job) }}
                                </p>
                            </div>
                        </div>
                         <div v-if="currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm">暂无其他成员</div>
                    </div>
                </div>

                <!-- Button to proceed (disabled if no job selected) -->
                <button @click="showStep(4)" :disabled="!state.selectedJob" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>

                <!-- Button to go back -->
                <button @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回
                </button>
            </div>

            <!-- Step 4: Personal Info -->
            <div id="step-personal-info" class="glass rounded-3xl p-8 mb-8" v-show="state.currentStep === 4">
                 <!-- Progress Bar is handled outside this div -->

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

                <!-- Personal Info Form -->
                <!-- @submit.prevent prevents default form submission and calls handleSubmitPersonalInfo -->
                <form @submit.prevent="handleSubmitPersonalInfo" class="mb-8">
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID</label>
                        <!-- v-model binds input to state -->
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你的舞萌游戏ID</p>
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼</label>
                         <!-- v-model binds input to state -->
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：小明" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">请输入你希望被称呼的名字</p>
                    </div>

                    <div class="mb-4">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号</label>
                         <!-- v-model binds input to state -->
                        <input type="text" id="qq-number" v-model="state.qqNumber" required placeholder="例如：123456789" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                        <p class="mt-1 text-xs text-gray-400">用于队伍联系</p>
                    </div>

                    <div class="mb-6">
                        <label class="flex items-start">
                            <!-- v-model binds checkbox checked state to state.privacyAgreed -->
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2">
                            <span class="text-xs text-gray-300">我已阅读并同意<a href="#" class="text-purple-400 hover:underline">隐私政策</a>，并允许收集和使用我的信息用于组队目的。</span>
                        </label>
                    </div>

                    <!-- Submit Button -->
                    <button type="submit" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                        提交
                    </button>

                    <!-- Back Button -->
                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 5: Completion Page -->
            <div id="step-completion" class="glass rounded-3xl p-8 mb-8" v-show="state.currentStep === 5">
                 <!-- Progress Bar (Completion) is handled outside this div -->
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
                            <!-- Display team info from state -->
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                            <p class="text-xs text-gray-400">{{ state.teamCode || '组队码' }} · 成员: {{ completionTotalMembers }}/3</p>
                        </div>
                    </div>
                </div>

                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                        <!-- Loop through all members including the new user -->
                        <div v-for="member in completionAllMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                             <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-4 h-4 text-white" alt="Member">
                            </div>
                            <div>
                                <p class="font-medium">{{ member.nickname }} <span v-if="member.isCurrentUser">(你)</span></p>
                                <p class="text-xs text-gray-400">
                                    <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }} ·
                                    <!-- Note: member.job here is already the type ('attacker'), not the ID ('job-attacker') -->
                                    <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon('job-' + member.job)}.svg`" class="w-3 h-3 inline-block" :alt="getJobText('job-' + member.job)"> {{ getJobText('job-' + member.job) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mb-8">
                    <h3 class="text-center font-medium mb-4">邀请更多好友加入</h3>

                    <div class="qr-code mb-4">
                        <!-- QR Code Placeholder - In a real app, generate this based on state.teamCode -->
                        <img src="https://unpkg.com/lucide-static@latest/icons/qr-code.svg" class="w-16 h-16 text-black" alt="QR Code">
                    </div>

                    <div class="flex mb-4">
                        <!-- Share link input with dynamic value -->
                        <input type="text" id="shareLink" readonly :value="`register.ngu3rd.mpam-lab.xyz/?code=${state.teamCode}`" class="share-link w-full rounded-l-lg py-3 px-4 text-white focus:outline-none">
                        <!-- Copy button -->
                        <button id="copyBtn" @click="copyShareLink" class="bg-purple-700 hover:bg-purple-600 rounded-r-lg px-4 transition">
                            <img src="https://unpkg.com/lucide-static@latest/icons/copy.svg" class="w-5 h-5 text-white" alt="Copy">
                        </button>
                    </div>

                    <div class="flex space-x-2">
                        <!-- Placeholder share buttons (QQ/WeChat sharing requires specific APIs/methods) -->
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

                <!-- Button to return to home/reset -->
                <button @click="goHome" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-800">
                    返回首页
                </button>
            </div>

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8">
                <p>© 2023 MPAM-Lab | register.ngu3rd.mpam-lab.xyz</p>
            </div>

        </div>

        <!-- Modals -->
        <!-- Using v-show to toggle modal visibility -->
        <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm mx-4 fade-in">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍，该队伍目前有 {{ currentTeamMembers.length }} 名成员。</p>
                <div class="flex space-x-4">
                    <!-- Buttons to close modal or confirm -->
                    <button @click="state.showConfirmModal = false" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition">
                        返回修改
                    </button>
                    <button @click="confirmJoinTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow">
                        确认加入
                    </button>
                </div>
            </div>
        </div>

        <div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center" v-show="state.showCreateModal">
            <div class="glass rounded-2xl p-6 max-w-sm mx-4 fade-in">
                <h3 class="text-xl font-bold mb-4">创建新队伍</h3>
                <p class="mb-4 text-sm text-gray-300">这个组队码尚未使用，请为你的队伍取个名字</p>
                <div class="mb-6">
                    <label for="newTeamName" class="block text-sm font-medium text-purple-300 mb-2">队伍名称</label>
                    <!-- v-model binds input to state.newTeamName -->
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：闪耀星辰" class="w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500">
                </div>
                <div class="flex space-x-4">
                    <!-- Buttons to close modal or create team -->
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
        <div class="loading-overlay" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p>提交中，请稍候...</p>
        </div>

         <!-- Celebration Container (Confetti will be added here by JS) -->
        <div class="celebration" id="celebration"></div>

    </div>
</template>

<style scoped>
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
    /* Cursor is handled by disabled-option */
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
    /* Width is controlled by inline style binding in template */
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
    z-index: -1;
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
    z-index: -1;
}
</style>