<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue'; // 引入 QR Code 组件

// --- Configuration ---
// 从环境变量获取 API 基础 URL，提供本地测试的默认值
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
// 从环境变量获取网站链接，提供一个默认值
const websiteLink = ref(import.meta.env.VITE_WEBSITE_LINK || 'http://localhost:5173'); // 使用环境变量

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
    avatarFile: null, // 新增：存储头像文件对象
    avatarPreviewUrl: null, // 新增：存储头像预览 URL

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

// 检查颜色是否已被队伍成员占用
const isColorDisabled = computed(() => (color) => {
    return state.currentTeamMembers.some(member => member.color === color);
});

// 检查职业是否已被队伍成员占用
const isJobDisabled = computed(() => (jobType) => {
    return state.currentTeamMembers.some(member => member.job === jobType);
});

// 计算分享链接 URL
const shareLinkUrl = computed(() => {
    if (!state.teamCode) return '';
    // 确保 websiteLink.value 末尾没有斜杠，并且总是添加 /?code=
    const baseUrl = websiteLink.value.endsWith('/') ? websiteLink.value.slice(0, -1) : websiteLink.value;
    return `${baseUrl}/?code=${state.teamCode}`;
});

// --- Methods / Functions ---

// 导航到指定步骤
function showStep(stepNumber) {
    // 离开完成步骤时清理 confetti 动画
    if (state.currentStep === 5 && state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
        const celebrationDiv = document.getElementById('celebration');
        if(celebrationDiv) celebrationDiv.innerHTML = ''; // 清理 DOM
    }

    state.currentStep = stepNumber;
    state.errorMessage = null; // 切换步骤时清除错误信息

    // 进入完成步骤时触发 confetti 动画
    if (stepNumber === 5) {
         setTimeout(() => {
             createConfetti();
             state.confettiInterval = setInterval(createConfetti, 2000);
         }, 100); // 稍作延迟
    }
}

// 处理输入组队码后的“继续”操作
async function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null;

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
            mode: 'cors', // 确保允许跨域请求
            body: JSON.stringify({ code }),
        });

        if (!response.ok) {
            console.error('API error:', response.status, response.statusText);
            // 尝试解析错误信息
            let errorData;
            try {
                errorData = await response.json();
            } catch (jsonError) {
                // 如果响应体不是有效的 JSON
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
             throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        if (data.exists) {
            // 队伍存在
            state.teamName = data.name;
            state.currentTeamMembers = data.members || [];
            state.isNewTeam = false;
            state.showConfirmModal = true;
        } else {
            // 队伍不存在
            state.teamName = null;
            state.currentTeamMembers = [];
            state.isNewTeam = true;
            state.showCreateModal = true;
        }

    } catch (e) {
        console.error('API Error checking team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。'; // 显示更具体的错误
        state.showLoadingOverlay = false; // 出错时也要关闭 loading
    } finally {
       // 仅在成功时才关闭 loading，或者在上面 catch 中处理
       if (!state.errorMessage) state.showLoadingOverlay = false;
    }
}

// 确认加入现有队伍
function confirmJoinTeam() {
    state.showConfirmModal = false;
    state.showLoadingOverlay = false; // 关闭可能残留的 loading
    showStep(2);
}

// 创建新队伍
async function createNewTeam() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null;

    if (!name) {
        state.errorMessage = '请输入队伍名称';
        return;
    }
     if (!code || code.length !== 4 || isNaN(parseInt(code))) {
         state.errorMessage = '无效的组队码'; // 防御性检查
         return;
     }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ code, name }),
        });

        const data = await response.json();

        if (!response.ok) {
             state.errorMessage = data.error || `创建队伍失败 (HTTP ${response.status})`;
             return;
        }

        // 创建成功
        state.teamName = data.name;
        state.currentTeamMembers = []; // 新队伍初始无成员
        state.showCreateModal = false;
        showStep(2);

    } catch (e) {
        console.error('API Error creating team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 选择颜色
function selectColor(color) {
    if (!isColorDisabled.value(color)) {
        state.selectedColor = color;
    }
}

// 获取颜色显示文本
function getColorText(colorId) {
     const map = { red: '红色', green: '绿色', blue: '蓝色' };
     return map[colorId] || '';
}

// 获取颜色对应的 Lucide 图标名称
function getColorIcon(colorId) {
    const map = { red: 'flame', green: 'leaf', blue: 'droplets' };
    return map[colorId] || 'help-circle';
}

// 选择职业
function selectJob(jobId) {
     const jobType = jobId.replace('job-', '');
    if (!isJobDisabled.value(jobType)) {
        state.selectedJob = jobType;
    }
}

// 获取职业显示文本
function getJobText(jobType) {
    const map = { attacker: '攻击手', defender: '防御手', supporter: '辅助手' };
    return map[jobType] || '';
}

// 获取职业对应的 Lucide 图标名称
function getJobIcon(jobType) {
    const map = { attacker: 'swords', defender: 'shield', supporter: 'heart-pulse' };
    return map[jobType] || 'help-circle';
}

// 新增：处理头像文件选择
function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) {
        state.avatarFile = null;
        if (state.avatarPreviewUrl) {
            URL.revokeObjectURL(state.avatarPreviewUrl); // 清理旧预览
        }
        state.avatarPreviewUrl = null;
        return;
    }

    // 可选：添加文件类型和大小检查
    if (!file.type.startsWith('image/')) {
        state.errorMessage = '请选择图片文件 (如 JPG, PNG, GIF)';
        event.target.value = ''; // 清空选择
        return;
    }
    if (file.size > 2 * 1024 * 1024) { // 限制 2MB
        state.errorMessage = '图片大小不能超过 2MB';
         event.target.value = ''; // 清空选择
        return;
    }

    state.avatarFile = file;

    // 生成预览 URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl); // 清理之前的预览 URL
    }
    state.avatarPreviewUrl = URL.createObjectURL(file);
    state.errorMessage = null; // 清除可能的文件错误信息
}

// 提交个人信息
async function handleSubmitPersonalInfo() {
    state.errorMessage = null;

    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私政策';
        return;
    }
    if (!state.selectedColor || !state.selectedJob) {
         state.errorMessage = '内部错误：未选择颜色或职业';
         return;
     }
     // 注意：这里的 avatarFile 还没有被发送到后端
     // 如果需要发送头像，你需要修改这里的 fetch 请求：
     // 1. 创建一个 FormData 对象
     // 2. 将所有字段（包括 state.avatarFile）添加到 FormData 中
     // 3. 修改 fetch 的 headers，移除 'Content-Type': 'application/json'
     // 4. 将 FormData 对象作为 body 发送
     // 5. 后端需要能处理 multipart/form-data 请求

    state.showLoadingOverlay = true;

    try {
        // 当前实现不发送头像文件
        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'cors',
            body: JSON.stringify({
                teamCode: state.teamCode,
                color: state.selectedColor,
                job: state.selectedJob,
                maimaiId: state.maimaiId.trim(),
                nickname: state.nickname.trim(),
                qqNumber: state.qqNumber.trim(),
                // avatar: 如果要发送头像，这里可能需要发送一个标识或 URL (取决于后端实现)
            }),
        });

        const data = await response.json();

        if (!response.ok) {
             state.errorMessage = data.error || `提交信息失败 (HTTP ${response.status})`;
             return;
        }

        // 成功加入
        state.completionAllMembers = data.members || [];
        state.teamName = data.name; // 确保 teamName 也从成功响应中更新
        showStep(5);

    } catch (e) {
        console.error('API Error joining team:', e);
        state.errorMessage = '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 复制分享链接
function copyShareLink() {
    const urlToCopy = shareLinkUrl.value; // 使用计算属性获取链接
    if (!urlToCopy) return;

    navigator.clipboard.writeText(urlToCopy).then(() => {
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalIconHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="已复制">';
            copyBtn.disabled = true; // 暂时禁用按钮
            setTimeout(() => {
                copyBtn.innerHTML = originalIconHTML;
                copyBtn.disabled = false;
            }, 2000);
        }
    }).catch(err => {
        console.error('无法使用 Clipboard API 复制: ', err);
        // 备选方法 (可能在非 https 环境或旧浏览器中需要)
        try {
            const inputElement = document.createElement('textarea');
            inputElement.value = urlToCopy;
            inputElement.style.position = 'absolute';
            inputElement.style.left = '-9999px';
            document.body.appendChild(inputElement);
            inputElement.select();
            document.execCommand('copy');
            document.body.removeChild(inputElement);

            // 提供反馈 (同上)
            const copyBtn = document.getElementById('copyBtn');
             if (copyBtn) {
                const originalIconHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="已复制">';
                 copyBtn.disabled = true;
                setTimeout(() => {
                    copyBtn.innerHTML = originalIconHTML;
                    copyBtn.disabled = false;
                }, 2000);
             }
        } catch (execErr) {
            console.error('无法使用 execCommand 复制: ', execErr);
            alert('复制失败，请手动复制链接。');
        }
    });
}

// 返回首页并重置状态
function goHome() {
    // 清理头像预览 URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }

    // 重置状态
    Object.assign(state, {
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
        avatarFile: null,
        avatarPreviewUrl: null,
        showConfirmModal: false,
        showCreateModal: false,
        showLoadingOverlay: false,
        errorMessage: null,
        currentTeamMembers: [],
        completionAllMembers: [],
        confettiInterval: null, // 确保 confetti 定时器也被清理
    });

    // 清理 URL 参数
    history.replaceState(null, '', window.location.pathname);

    showStep(1);
}

// Confetti 动画 (保持不变)
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
        confetti.addEventListener('animationend', () => { confetti.remove(); });
    }
}

    // 监听 teamCode 变化，用于实时更新二维码和分享链接 (如果 teamCode 在最终页面还可能变化的话)
    // watch(() => state.teamCode, (newCode) => {
    //   console.log("Team code changed, share link is now:", shareLinkUrl.value);
    // });

// --- Lifecycle Hooks ---

onMounted(() => {
    // 页面加载时检查 URL 是否有组队码
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');

    if (codeParam && codeParam.length === 4 && !isNaN(parseInt(codeParam))) {
        state.teamCode = codeParam;
        handleContinue(); // 自动触发检查
    } else {
       showStep(state.currentStep); // 确保显示初始步骤
    }
});

onUnmounted(() => {
    // 清理 confetti 定时器
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
    // 清理头像预览 Object URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
});

</script>

<template>
    <!-- 根容器，使用 flex 居中内容 -->
    <div class="bg-gray-900 text-white min-h-screen flex items-center justify-center px-4 py-8 overflow-y-auto">

        <!-- 主内容容器，限制最大宽度并水平居中 -->
        <div class="container max-w-md mx-auto w-full"> <!-- max-w-sm on smaller screens, max-w-md on sm+ -->

            <!-- 进度条 (步骤 2-4 可见) -->
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

             <!-- 错误消息显示区域 -->
             <div v-if="state.errorMessage" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 fade-in shadow-lg flex items-center">
                 <img src="https://unpkg.com/lucide-static@latest/icons/alert-triangle.svg" class="w-5 h-5 mr-2 text-yellow-300" alt="Error">
                 <span>{{ state.errorMessage }}</span>
            </div>

            <!-- Step 1: 组队码输入 -->
            <div id="step-team-code" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 1">
                <!-- Header -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-12 h-12 text-white" alt="Team">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">舞萌队伍注册</h1>
                    <p class="text-purple-300">输入四位数组队码加入或创建队伍</p>
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
                        class="input-code w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-4 px-6 text-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-center tracking-[0.5em]"
                        @input="(event) => state.teamCode = event.target.value.replace(/[^0-9]/g, '')"
                    >
                    <p class="mt-2 text-xs text-gray-400">不存在的组队码将自动创建新队伍</p>
                </div>

                <!-- Continue Button -->
                <button @click="handleContinue" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300">
                    继续
                </button>
            </div>

            <!-- Step 2: 颜色选择 -->
            <div id="step-color-selection" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 2">
                <!-- Header -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的颜色</h1>
                    <p class="text-purple-300">每个队伍中的颜色必须唯一</p>
                </div>

                <!-- Team Info Box -->
                <div class="glass rounded-xl p-4 mb-8">
                     <div class="flex items-center">
                         <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md">
                             <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                        </div>
                        <div>
                            <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                             <p class="text-xs text-gray-400">{{ state.teamCode || '----' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                        </div>
                    </div>
                </div>

                <!-- Color Options Grid -->
                <div class="grid grid-cols-3 gap-4 mb-8">
                    <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'red', 'disabled-option': isColorDisabled('red') }"
                         @click="selectColor('red')" @keydown.enter="selectColor('red')" @keydown.space="selectColor('red')">
                        <div class="color-red-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-red-shadow">
                             <img src="https://unpkg.com/lucide-static@latest/icons/flame.svg" class="w-10 h-10 text-white" alt="Red">
                        </div>
                        <p class="text-center font-medium">红色</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'green', 'disabled-option': isColorDisabled('green') }"
                         @click="selectColor('green')" @keydown.enter="selectColor('green')" @keydown.space="selectColor('green')">
                        <div class="color-green-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-green-shadow">
                             <img src="https://unpkg.com/lucide-static@latest/icons/leaf.svg" class="w-10 h-10 text-white" alt="Green">
                        </div>
                        <p class="text-center font-medium">绿色</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'blue', 'disabled-option': isColorDisabled('blue') }"
                         @click="selectColor('blue')" @keydown.enter="selectColor('blue')" @keydown.space="selectColor('blue')">
                        <div class="color-blue-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-blue-shadow">
                             <img src="https://unpkg.com/lucide-static@latest/icons/droplets.svg" class="w-10 h-10 text-white" alt="Blue">
                        </div>
                        <p class="text-center font-medium">蓝色</p>
                    </div>
                </div>

                <!-- Current Members Box -->
                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                         <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                        <div v-else v-for="member in state.currentTeamMembers" :key="member.nickname + member.color" class="flex items-center">
                             <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm">
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(member.color)">
                            </div>
                            <div>
                                <p class="font-medium text-sm">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-300 flex items-center">
                                     <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                     <span class="mx-1">·</span>
                                     <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                 <button @click="showStep(3)" :disabled="!state.selectedColor" :class="{'opacity-50 cursor-not-allowed': !state.selectedColor}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <button @click="goHome()" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回首页
                </button>
            </div>

            <!-- Step 3: 职业选择 -->
            <div id="step-job-selection" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 3">
                 <!-- Header -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的职业</h1>
                    <p class="text-purple-300">每个队伍中的职业也必须唯一</p>
                </div>

                <!-- Team Info Box -->
                 <div class="glass rounded-xl p-4 mb-8">
                     <div class="flex items-center justify-between">
                         <div class="flex items-center">
                             <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md">
                                <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-5 h-5 text-white" alt="Team">
                            </div>
                            <div>
                                <h3 class="font-bold">{{ state.teamName || '队伍名称' }}</h3>
                                 <p class="text-xs text-gray-400">{{ state.teamCode || '----' }} · 成员: {{ state.currentTeamMembers.length }}/3</p>
                            </div>
                         </div>
                         <!-- Selected Color Display -->
                         <div class="flex items-center glass rounded-full px-3 py-1">
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0 shadow-sm">
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-3 h-3 text-white" :alt="getColorText(state.selectedColor)">
                            </div>
                            <span class="text-xs font-medium">{{ getColorText(state.selectedColor) || '颜色' }}</span>
                        </div>
                    </div>
                </div>

                <!-- Job Options Grid -->
                 <div class="grid grid-cols-3 gap-4 mb-8">
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'attacker', 'disabled-option': isJobDisabled('attacker') }"
                         @click="selectJob('job-attacker')" @keydown.enter="selectJob('job-attacker')" @keydown.space="selectJob('job-attacker')">
                         <div class="job-attacker-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/swords.svg" class="w-10 h-10 text-white" alt="Attacker">
                        </div>
                        <p class="text-center font-medium">攻击手</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'defender', 'disabled-option': isJobDisabled('defender') }"
                         @click="selectJob('job-defender')" @keydown.enter="selectJob('job-defender')" @keydown.space="selectJob('job-defender')">
                         <div class="job-defender-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/shield.svg" class="w-10 h-10 text-white" alt="Defender">
                        </div>
                        <p class="text-center font-medium">防御手</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'supporter', 'disabled-option': isJobDisabled('supporter') }"
                         @click="selectJob('job-supporter')" @keydown.enter="selectJob('job-supporter')" @keydown.space="selectJob('job-supporter')">
                        <div class="job-supporter-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/heart-pulse.svg" class="w-10 h-10 text-white" alt="Supporter">
                        </div>
                        <p class="text-center font-medium">辅助手</p>
                    </div>
                </div>

                <!-- Current Members Box -->
                <div class="glass rounded-xl p-4 mb-8">
                     <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                         <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                        <div v-else v-for="member in state.currentTeamMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                            <div :class="`color-${member.color}-bg`" class="rounded-full w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm">
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(member.color)">
                            </div>
                            <div>
                                <p class="font-medium text-sm">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-300 flex items-center">
                                     <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                     <span class="mx-1">·</span>
                                    <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                <button @click="showStep(4)" :disabled="!state.selectedJob" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <button @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- Step 4: 个人信息 -->
            <div id="step-personal-info" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 4">
                 <!-- Header -->
                 <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">填写个人信息</h1>
                    <p class="text-purple-300">完成最后一步即可加入队伍</p>
                </div>

                <!-- Summary Box -->
                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3 text-center text-purple-300">你的选择</h3>
                    <div class="flex items-center justify-around">
                         <!-- Team -->
                        <div class="text-center flex flex-col items-center">
                             <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mb-1 shadow-md">
                                <img src="https://unpkg.com/lucide-static@latest/icons/users.svg" class="w-4 h-4 text-white" alt="Team">
                            </div>
                            <p class="text-xs font-medium">{{ state.teamName || '队伍' }}</p>
                             <p class="text-xs text-gray-400">{{ state.teamCode || '代码' }}</p>
                        </div>
                         <!-- Color -->
                         <div class="text-center flex flex-col items-center">
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full p-2 mb-1 shadow-md">
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(state.selectedColor)">
                             </div>
                             <p class="text-xs font-medium">{{ getColorText(state.selectedColor) || '颜色' }}</p>
                        </div>
                         <!-- Job -->
                         <div class="text-center flex flex-col items-center">
                            <div :class="`job-${state.selectedJob}-bg`" class="rounded-full p-2 mb-1 shadow-md job-summary-shadow">
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(state.selectedJob)}.svg`" class="w-4 h-4 text-white" :alt="getJobText(state.selectedJob)">
                            </div>
                             <p class="text-xs font-medium">{{ getJobText(state.selectedJob) || '职业' }}</p>
                        </div>
                    </div>
                </div>

                <!-- Form -->
                 <form @submit.prevent="handleSubmitPersonalInfo">

                    <!-- Avatar Upload Section -->
                    <div class="mb-6 text-center">
                        <label class="block text-sm font-medium text-purple-300 mb-3">上传头像 (可选)</label>
                        <div class="flex flex-col items-center space-y-3">
                            <!-- Preview Image -->
                            <img v-if="state.avatarPreviewUrl" :src="state.avatarPreviewUrl" alt="头像预览" class="w-24 h-24 rounded-full object-cover border-2 border-purple-500 shadow-md">
                            <div v-else class="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600">
                                <img src="https://unpkg.com/lucide-static@latest/icons/user.svg" class="w-10 h-10 text-gray-400" alt="Default Avatar">
                            </div>
                             <!-- File Input Button -->
                            <label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                {{ state.avatarFile ? '更换头像' : '选择图片' }}
                            </label>
                            <input type="file" id="avatar-upload" @change="handleAvatarChange" accept="image/*" class="hidden">
                            <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>
                        </div>
                    </div>

                    <!-- Other Fields -->
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID <span class="text-red-500">*</span></label>
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：1234567890123" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：小明" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                    </div>

                    <div class="mb-6">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="qq-number" v-model="state.qqNumber" required placeholder="方便队长联系" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none">
                    </div>

                    <!-- Privacy Agreement -->
                     <div class="mb-6">
                        <label class="flex items-start cursor-pointer">
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-500 rounded bg-gray-700">
                             <span class="text-xs text-gray-300 select-none">我已阅读并同意<a href="#" @click.prevent class="text-purple-400 hover:underline font-medium">隐私政策</a>，允许收集和使用我的QQ号用于组队联系目的。<span class="text-red-500">*</span></span>
                        </label>
                    </div>

                    <!-- Action Buttons -->
                    <button type="submit" :disabled="!state.privacyAgreed" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :class="{'opacity-50 cursor-not-allowed': !state.privacyAgreed}">
                        完成注册
                    </button>

                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 5: 完成页面 -->
            <div id="step-completion" class="glass rounded-3xl p-8 fade-in" v-show="state.currentStep === 5">
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

                <!-- Success Message -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 bg-gradient-to-br from-green-500 to-teal-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://unpkg.com/lucide-static@latest/icons/check-circle.svg" class="w-12 h-12 text-white" alt="Success">
                    </div>
                    <h1 class="text-3xl font-bold mb-2">注册成功！</h1>
                    <p class="text-teal-300">你已成功加入“<span class="font-bold">{{ state.teamName || '队伍' }}</span>”</p>
                </div>

                <!-- Team Info Box -->
                 <div class="glass rounded-xl p-4 mb-8">
                     <div class="flex items-center">
                         <div class="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full p-2 mr-3 shadow-md">
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
                <div class="glass rounded-xl p-4 mb-8">
                    <h3 class="text-sm font-medium mb-3">队伍成员</h3>
                    <div class="space-y-3">
                         <div v-if="state.completionAllMembers.length === 0" class="text-center text-gray-500 text-sm py-2">队伍信息加载中...</div>
                         <div v-else v-for="member in state.completionAllMembers" :key="member.nickname /* Assuming nickname is unique in the final list, or use a combined key */" class="flex items-center relative">
                             <!-- Avatar Placeholder/Image -->
                             <img
                                 v-if="member.avatar_url"
                                 :src="member.avatar_url"
                                 alt="头像"
                                 class="rounded-full w-10 h-10 object-cover mr-3 flex-shrink-0 border-2 border-gray-600"
                                 :class="[`border-${member.color}-500`]"
                             >
                             <!-- Default icon if no avatar_url -->
                              <div
                                v-else
                                :class="`color-${member.color}-bg`"
                                class="rounded-full w-10 h-10 flex items-center justify-center mr-3 flex-shrink-0 shadow-sm border-2 border-gray-600"
                              >
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-5 h-5 text-white" :alt="getColorText(member.color)">
                              </div>

                             <!-- Member Details -->
                            <div class="flex-grow">
                                <p class="font-medium text-sm flex items-center">
                                    {{ member.nickname }}
                                     <!-- Highlight "You" based on matching maimaiId -->
                                     <span v-if="member.maimaiId === state.maimaiId || member.maimai_id === state.maimaiId" class="ml-2 text-xs bg-purple-600 px-1.5 py-0.5 rounded text-white font-bold">你</span>
                                </p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                    <span class="flex items-center mr-2">
                                        <span :class="`color-indicator color-${member.color}-bg`"></span>
                                        {{ getColorText(member.color) }}
                                    </span>
                                    <span class="flex items-center">
                                         <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1" :alt="getJobText(member.job)">
                                        {{ getJobText(member.job) }}
                                    </span>
                                </p>
                            </div>
                        </div>
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
                     <div class="flex mb-4">
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
                             @click="copyShareLink"
                             class="bg-purple-700 hover:bg-purple-600 rounded-r-lg px-4 transition duration-200 flex items-center justify-center"
                             :disabled="!shareLinkUrl"
                             :class="{'opacity-50 cursor-not-allowed': !shareLinkUrl}"
                             aria-label="复制链接"
                         >
                             <img src="https://unpkg.com/lucide-static@latest/icons/copy.svg" class="w-5 h-5 text-white" alt="Copy">
                        </button>
                    </div>

                    <!-- Optional: Placeholder Share Buttons -->
                    <!-- <div class="flex space-x-2">
                        <button class="flex-1 flex items-center justify-center bg-blue-500 hover:bg-blue-600 rounded-lg py-2 transition text-white font-medium text-sm">
                            <img src="https://unpkg.com/lucide-static@latest/icons/message-circle.svg" class="w-4 h-4 mr-1.5" alt="QQ">
                            <span>分享到QQ</span>
                        </button>
                        <button class="flex-1 flex items-center justify-center bg-green-500 hover:bg-green-600 rounded-lg py-2 transition text-white font-medium text-sm">
                             <img src="https://unpkg.com/lucide-static@latest/icons/message-square.svg" class="w-4 h-4 mr-1.5" alt="WeChat">
                            <span>分享到微信</span>
                        </button>
                    </div> -->
                </div>

                <!-- Back to Home Button -->
                <button @click="goHome" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回首页
                </button>
            </div> <!-- End of Step 5 -->

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8">
                <!-- 使用环境变量中的域名 -->
                 <p>© {{ new Date().getFullYear() }} MPAM-Lab | <a :href="websiteLink" target="_blank" rel="noopener noreferrer" class="hover:text-purple-400">{{ websiteLink.replace(/^https?:\/\//, '') }}</a></p>
            </div>

        </div> <!-- End of Container -->

        <!-- Modals (Keep as they are) -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6 text-sm text-gray-200">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍。当前成员 <span class="font-bold">{{ state.currentTeamMembers.length }}</span>/3。</p>
                 <!-- Display members in confirm modal -->
                 <div v-if="state.currentTeamMembers.length > 0" class="mb-4 space-y-2 max-h-24 overflow-y-auto text-xs border-t border-b border-gray-700 py-2">
                     <span class="font-semibold text-purple-300 block mb-1">现有成员:</span>
                     <div v-for="member in state.currentTeamMembers" :key="member.nickname" class="flex items-center">
                         <div :class="`color-indicator color-${member.color}-bg mr-1.5`"></div>
                         <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1 opacity-80" :alt="getJobText(member.job)">
                         <span>{{ member.nickname }} ({{ getColorText(member.color) }}, {{ getJobText(member.job) }})</span>
                     </div>
                 </div>
                 <p v-else class="mb-4 text-sm text-gray-400 italic">队伍目前还没有成员。</p>

                <div class="flex space-x-4">
                    <button @click="state.showConfirmModal = false; state.showLoadingOverlay = false;" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        返回修改
                    </button>
                    <button @click="confirmJoinTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium">
                        确认加入
                    </button>
                </div>
            </div>
        </div>

       <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" v-show="state.showCreateModal">
           <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700">
                <h3 class="text-xl font-bold mb-4">创建新队伍</h3>
                <p class="mb-4 text-sm text-gray-200">组队码 <span class="font-bold text-purple-400">{{ state.teamCode }}</span> 未被使用。请为你的队伍命名：</p>
                <div class="mb-6">
                    <label for="newTeamName" class="block text-sm font-medium text-purple-300 mb-2">队伍名称 <span class="text-red-500">*</span></label>
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：银河战舰" class="w-full form-input rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="20">
                     <p v-if="state.errorMessage && state.showCreateModal" class="mt-2 text-xs text-red-400">{{ state.errorMessage }}</p>
                </div>
                <div class="flex space-x-4">
                    <button @click="state.showCreateModal = false; state.errorMessage = null;" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button @click="createNewTeam" :disabled="!state.newTeamName" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium" :class="{'opacity-50 cursor-not-allowed': !state.newTeamName}">
                        确认创建
                    </button>
                </div>
            </div>
        </div>

        <!-- Loading Overlay (Keep as it is) -->
        <div class="loading-overlay z-[60]" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p>处理中，请稍候...</p>
        </div>

         <!-- Celebration Container (Keep as it is) -->
        <div class="celebration z-0" id="celebration"></div>

    </div> <!-- End of Root Container -->
</template>

<style scoped>
/* Custom styles from previous HTML */
/* Base styles */
.glass {
    background: rgba(31, 41, 55, 0.6); /* Darker glass */
    backdrop-filter: blur(12px) saturate(150%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}
.input-code {
    /* letter-spacing: 0.5em; */ /* Adjusted tracking in class */
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
.fade-in {
    animation: fadeIn 0.5s ease-in-out;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
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
.color-option:not(.disabled-option):hover, .job-option:not(.disabled-option):hover {
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
    /* pointer-events: none; REMOVED - better to show tooltip */
    position: relative;
}
.disabled-option:hover {
    transform: none; /* Don't lift on hover if disabled */
     background-color: transparent;
}
.disabled-option::after {
    content: "已被选择";
    position: absolute;
    bottom: 10px; /* Position at bottom */
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
    opacity: 0; /* Hidden by default */
    transition: opacity 0.2s ease;
    pointer-events: none; /* Tooltip shouldn't block */
}
.disabled-option:hover::after {
    opacity: 1; /* Show tooltip on hover */
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
}
input[type="checkbox"]:checked {
  background-color: #8b5cf6; /* Purple check */
  border-color: #a78bfa;
}
input[type="checkbox"]:checked::before {
  content: '✔';
  display: block;
  position: absolute;
  top: -2px;
  left: 1px;
  font-size: 12px;
  color: white;
}
input[type="checkbox"]:focus {
  outline: _2px solid #a78bfa;
  outline-offset: 2px;
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

/* Loading Overlay */
.loading-overlay {
    position: fixed;
    inset: 0; /* top, right, bottom, left = 0 */
    background: rgba(17, 24, 39, 0.8); /* bg-gray-900 with opacity */
    backdrop-filter: blur(4px);
    z-index: 60; /* Ensure it's above content but potentially below modals if needed */
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    color: white;
    text-align: center;
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

/* Confetti Styles */
.confetti {
    position: fixed;
    width: 10px;
    height: 10px;
    /* Background color set by JS */
    animation: confetti-fall 5s linear forwards; /* Changed animation */
    z-index: 1; /* Above background, below content */
    border-radius: 2px; /* Slightly less round? */
    mix-blend-mode: screen; /* Try screen blend mode */
    opacity: 0.9;
}
@keyframes confetti-fall {
    0% {
        transform: translateY(-20px) rotate(0deg) scale(1);
        opacity: 1;
    }
     50% {
         transform: translateY(50vh) rotate(360deg) scale(0.8);
         opacity: 0.8;
     }
    100% {
        transform: translateY(105vh) rotate(720deg) scale(0.5);
        opacity: 0;
    }
}
.celebration {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1; /* Ensure confetti is behind interactive elements */
    overflow: hidden; /* Prevent scrollbars caused by confetti */
}

/* QR Code & Share Link */
.qr-code-container {
    background: white;
    padding: 10px; /* Padding around the QR code */
    border-radius: 12px; /* Rounded corners for the white background */
    width: 160px; /* Fit the 140px QR code + padding */
    height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto; /* Center the box */
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}
/* Ensure SVG QR Code fits */
.qr-code-container > svg {
    display: block; /* Remove extra space below SVG */
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

/* Responsive adjustments */
/* Inherited max-width adjustment from previous snippet */
@media (min-width: 640px) {
    /* .container { max-width: 28rem; } */ /* Already set to max-w-md */
}

/* Remove body overflow hidden */
/* html, body { */
/*    overflow: visible; */ /* Allow scrolling if content exceeds viewport */
/* } */

/* Ensure root div handles scrolling */
/* div[class*="min-h-screen"] { */
/*    overflow-y: auto; */ /* Already set on root div */
/* } */

</style>