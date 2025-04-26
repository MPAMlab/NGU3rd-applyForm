<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue'; // 引入 QR Code 组件

// --- Configuration ---
// 从环境变量获取 API 基础 URL，提供本地测试的默认值
// 请确保在 .env 文件中设置 VITE_API_BASE_URL，例如 VITE_API_BASE_URL="https://your-worker-name.your-account.workers.dev/api"
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
// 从环境变量获取网站链接，用于生成分享链接
// 请确保在 .env 文件中设置 VITE_WEBSITE_LINK，例如 VITE_WEBSITE_LINK="https://your-frontend-domain.com"
const websiteLink = ref(import.meta.env.VITE_WEBSITE_LINK || 'http://localhost:5173'); // 使用环境变量

const MAX_AVATAR_SIZE_MB = 2; // 头像文件大小限制 (MB)，与后端配置一致

// --- State Management (Reactive) ---
const state = reactive({
    currentStep: 1,
    teamCode: null,
    teamName: null,
    isNewTeam: false, // True if creating a new team
    newTeamName: null, // Input for new team name
    selectedColor: null, // 'red', 'green', or 'blue'
    selectedJob: null, // 'attacker', 'defender', or 'supporter'

    // User Info for Joining (Step 4)
    maimaiId: null, // User's Maimai ID
    nickname: null, // User's nickname
    qqNumber: null, // User's QQ number
    privacyAgreed: false,
    avatarFile: null, // 头像文件对象 (for joining)
    avatarPreviewUrl: null, // 头像预览 URL (for joining)

    // User Info for Editing/Deleting (Modal)
    showEditModal: false, // 新增：控制修改/删除模态框显示
    editAuthMaimaiId: null, // 新增：用于模态框验证的 Maimai ID 输入
    editAuthQqNumber: null, // 新增：用于模态框验证的 QQ 号输入
    editNewNickname: null, // 新增：模态框中的新昵称输入
    editNewQqNumber: null, // 新增：模态框中的新 QQ 号输入
    editNewColor: null, // 新增：模态框中的新颜色选择
    editNewJob: null, // 新增：模态框中的新职业选择
    editNewAvatarFile: null, // 新增：模态框中的新头像文件对象
    editNewAvatarPreviewUrl: null, // 新增：模态框中的新头像预览 URL
    editClearAvatarFlag: false, // 新增：模态框中的清空头像标记

    // UI State
    showConfirmModal: false, // 确认加入模态框
    showCreateModal: false, // 创建队伍模态框
    showLoadingOverlay: false, // 全局加载覆盖层
    errorMessage: null, // To display API errors

    // Data fetched from API
    currentTeamMembers: [], // Members of the team when checking/joining (may not have all fields)
    completionAllMembers: [], // All members with full details after successful join (for Step 5)

    confettiInterval: null, // To store interval ID for cleanup
});

// --- Computed Properties ---
const progressWidth = computed(() => {
    const stepProgress = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };
    return `${stepProgress[state.currentStep]}%`;
});

// 检查颜色是否已被队伍成员占用
const isColorDisabled = computed(() => (color) => {
    // 在编辑模式下，不禁用当前编辑的成员已选择的颜色/职业
     if (state.showEditModal && state.editAuthMaimaiId) {
        const memberBeingEdited = state.currentTeamMembers.find(m => (m.maimai_id || m.maimaiId) === state.editAuthMaimaiId);
         if (memberBeingEdited && memberBeingEdited.color === color) return false;
     }
     // else, check against all members
    return state.currentTeamMembers.some(member => member.color === color);
});

// 检查职业是否已被队伍成员占用
const isJobDisabled = computed(() => (jobType) => {
    // 在编辑模式下，不禁用当前编辑的成员已选择的颜色/职业
     if (state.showEditModal && state.editAuthMaimaiId) {
         const memberBeingEdited = state.currentTeamMembers.find(m => (m.maimai_id || m.maimaiId) === state.editAuthMaimaiId);
         if (memberBeingEdited && memberBeingEdited.job === jobType) return false;
     }
    // else, check against all members
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
             state.confettiInterval = setInterval(createConfetti, 2000); // 每2秒创建一批新的
         }, 100); // 稍作延迟，确保 DOM 渲染
    }
}

// 处理输入组队码后的“继续”操作 (API: POST /api/teams/check)
async function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null;

    // 基础输入验证
    if (code.length !== 4 || isNaN(parseInt(code))) {
        state.errorMessage = '请输入4位数字的组队码。';
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

        const data = await response.json(); // 总是尝试解析 JSON，即使是非 2xx 响应

        if (!response.ok) {
            // 如果状态码不是成功 (2xx)
            console.error('API error checking team:', response.status, response.statusText, data);
             // 使用后端返回的 error 消息
            throw new Error(data.error || `检查队伍失败 (${response.status})`);
        }

        // API 成功响应 (2xx)
        if (data.exists) {
            // 队伍存在
            state.teamName = data.name;
            state.currentTeamMembers = data.members || []; // currentTeamMembers 用于步骤2和3的成员列表显示
            state.isNewTeam = false;
            state.showConfirmModal = true; // 显示确认加入模态框
        } else {
            // 队伍不存在
            state.teamName = null; // 清空队伍名称
            state.currentTeamMembers = []; // 清空成员列表
            state.isNewTeam = true;
            state.showCreateModal = true; // 显示创建队伍模态框
        }

    } catch (e) {
        console.error('Fetch error checking team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.showLoadingOverlay = false; // 出错时也要关闭 loading
    } finally {
       // 如果没有错误消息，说明 API 调用成功，此时可以关闭 loading overlay
       if (!state.errorMessage && (state.showConfirmModal || state.showCreateModal)) {
           // loading overlay 会在模态框确认后关闭，这里不需要再关
       } else if (!state.errorMessage) {
           // 如果没有显示模态框，但也没收到错误（例如，直接跳转到其他步骤），则关闭 loading
            state.showLoadingOverlay = false;
       }
       // 如果有错误，上面的 catch 已经处理并设置了 errorMessage 和关闭 loading
    }
}

// 确认加入现有队伍 (从模态框点击确认)
function confirmJoinTeam() {
    state.showConfirmModal = false;
    state.showLoadingOverlay = false; // 关闭确认模态框前的 loading
    showStep(2); // 跳转到颜色选择步骤
}

// 创建新队伍 (API: POST /api/teams/create)
async function createNewTeam() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null;

     // 基础输入验证
    if (!name || name.length === 0 || name.length > 50) {
        state.errorMessage = '队伍名称不能为空，且不能超过50个字符。';
        return;
    }
     if (!code || code.length !== 4 || isNaN(parseInt(code))) {
         state.errorMessage = '无效的组队码。'; // 防御性检查，理论上 check 阶段已验证
         return;
     }

    state.showLoadingOverlay = true; // 显示 loading overlay

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ code, name }),
        });

        const data = await response.json();

        if (!response.ok) {
             // 使用后端返回的 error 消息
             console.error('API error creating team:', response.status, data);
             throw new Error(data.error || `创建队伍失败 (${response.status})`);
        }

        // 创建成功
        state.teamName = data.name;
        state.currentTeamMembers = []; // 新队伍初始无成员
        state.showCreateModal = false; // 关闭创建模态框
        showStep(2); // 跳转到颜色选择步骤

    } catch (e) {
        console.error('Fetch error creating team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.showCreateModal = false; // 出错也关闭模态框
    } finally {
        state.showLoadingOverlay = false; // 关闭 loading overlay
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
    return map[colorId] || 'help-circle'; // 提供默认图标
}

// 选择职业
function selectJob(jobId) {
     const jobType = jobId.replace('job-', ''); // jobId might be 'job-attacker'
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
    return map[jobType] || 'help-circle';// 提供默认图标
}

// Step 4: 处理头像文件选择和预览
function handleAvatarChange(event) {
    const file = event.target.files?.[0]; // 使用 ?. 避免错误
    state.errorMessage = null; // 清除旧错误

    if (!file) {
        state.avatarFile = null;
        if (state.avatarPreviewUrl) {
            URL.revokeObjectURL(state.avatarPreviewUrl); // 清理旧预览 URL
        }
        state.avatarPreviewUrl = null;
        return;
    }

     // 文件类型和大小检查
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.errorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
        event.target.value = ''; // 清空选择的文件 input
        state.avatarFile = null;
         return;
    }
    const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
        state.errorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         event.target.value = ''; // 清空选择的文件 input
         state.avatarFile = null;
        return;
    }

    // 文件有效，更新 state
    state.avatarFile = file;

    // 生成预览 URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl); // 清理之前的预览 URL
    }
    state.avatarPreviewUrl = URL.createObjectURL(file);
    console.log("Avatar file selected:", file.name, "Preview URL:", state.avatarPreviewUrl);

}

// step 4: 提交个人信息 (API: POST /api/teams/join) - 已修改为发送 FormData
async function handleSubmitPersonalInfo() {
    state.errorMessage = null;

    // 再次验证必填字段
    if (!state.maimaiId || !state.nickname || !state.qqNumber || !state.privacyAgreed) {
        state.errorMessage = '请填写所有必填字段并同意隐私政策。';
        return;
    }
     if (!state.selectedColor || !state.selectedJob) {
         state.errorMessage = '内部错误：颜色或职业未选择。请返回上一步。';
         return;
     }
    // QQ 号格式验证 (简单的数字验证)
    if (!/^[1-9][0-9]{4,14}$/.test(state.qqNumber.trim())) {
        state.errorMessage = '请输入有效的QQ号码 (5-15位数字, 非0开头)。';
        return;
    }

    state.showLoadingOverlay = true;

    try {
        // 使用 FormData 来发送包含文件的请求
        const formData = new FormData();
        formData.append('teamCode', state.teamCode.trim());
        formData.append('color', state.selectedColor);
        formData.append('job', state.selectedJob);
        formData.append('maimaiId', state.maimaiId.trim());
        formData.append('nickname', state.nickname.trim());
        formData.append('qqNumber', state.qqNumber.trim());

        // 如果用户选择了头像文件，添加到 FormData
        if (state.avatarFile) {
            formData.append('avatarFile', state.avatarFile);
            console.log("Appending avatar file to FormData:", state.avatarFile.name);
        } else {
            console.log("No avatar file selected for join request.");
        }

        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            // 当 body 是 FormData 对象时，fetch API 会自动设置正确的 Content-Type: multipart/form-data 头部，
            // 包括 boundary 参数。我们不应该手动设置这个头部，否则会导致问题。
            // headers: { 'Content-Type': 'multipart/form-data' }, // <-- 不要手动设置
            mode: 'cors',
            body: formData, // 发送 FormData 对象
        });

        const data = await response.json(); // 总是尝试解析 JSON

        if (!response.ok) {
             // 如果状态码不是成功 (2xx 或 201)
             console.error('API error joining team:', response.status, data);
              throw new Error(data.error || `加入队伍失败 (${response.status})`);
        }

        // 成功加入，后端返回了更新后的成员列表和队伍信息
        state.completionAllMembers = data.members || []; // 更新 Step 5 显示的成员列表
        state.teamName = data.name; // 确保 teamName 也从成功响应中更新
        console.log("Successfully joined team. Data:", data);
        showStep(5);

    } catch (e) {
        console.error('Fetch error joining team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 复制分享链接
function copyShareLink() {
    const urlToCopy = shareLinkUrl.value; // 使用计算属性获取链接
    if (!urlToCopy) return;

    navigator.clipboard.writeText(urlToCopy).then(() => {
        const copyBtn = document.getElementById('copyBtn'); // 确保有这个 ID
        if (copyBtn) {
            const originalIconHTML = copyBtn.innerHTML;
            // 切换到“已复制”图标
            copyBtn.innerHTML = '<img src="https://unpkg.com/lucide-static@latest/icons/check.svg" class="w-5 h-5 text-white" alt="已复制">';
            copyBtn.disabled = true; // 暂时禁用按钮
            setTimeout(() => {
                copyBtn.innerHTML = originalIconHTML; // 恢复原始图标
                copyBtn.disabled = false;
            }, 2000); // 2秒后恢复
        }
    }).catch(err => {
        console.error('无法使用 Clipboard API 复制: ', err);
        // 备选方法 (可能在非 https 环境或旧浏览器中需要)
        try {
            const inputElement = document.createElement('textarea');
            inputElement.value = urlToCopy;
            inputElement.style.position = 'absolute';
            inputElement.style.left = '-9999px'; // 移出视口
            document.body.appendChild(inputElement);
            inputElement.select(); // 选中内容
            document.execCommand('copy'); // 执行复制命令
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
            // 如果备选方法也失败，提示用户手动复制
            alert(`复制失败，请手动复制链接：\n${urlToCopy}`);
        }
    });
}

// 返回首页并重置所有相关状态
function goHome() {
    // 清理 Step 4 的头像预览 URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
     // 清理编辑模态框的头像预览 URL (如果它曾被打开)
     if (state.editNewAvatarPreviewUrl) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }

    // 重置所有状态变量到初始值
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
        avatarFile: null, // Step 4 avatar clean
        avatarPreviewUrl: null, // Step 4 avatar clean

        // Reset Edit Modal state
        showEditModal: false,
        editAuthMaimaiId: null,
        editAuthQqNumber: null,
        editNewNickname: null,
        editNewQqNumber: null,
        editNewColor: null,
        editNewJob: null,
        editNewAvatarFile: null, // Edit modal avatar clean
        editNewAvatarPreviewUrl: null, // Edit modal avatar clean
        editClearAvatarFlag: false,

        // Reset UI/API state
        showConfirmModal: false,
        showCreateModal: false,
        showLoadingOverlay: false,
        errorMessage: null,

        // Reset data state
        currentTeamMembers: [],
        completionAllMembers: [],

        confettiInterval: null, // 确保 confetti 定时器也被清理
    });

    // 清理 URL 参数
    history.replaceState(null, '', window.location.pathname);

    // 可选：在这里等待 DOM 重置后，主动触发 Step 1 的动画
     setTimeout(() => {
         showStep(1);
     }, 50); // 短暂延迟确保状态重置

}

// Confetti 动画 (保持不变，或根据需要调整数量/颜色/时间)
function createConfetti() {
    const celebrationDiv = document.getElementById('celebration');
    if (!celebrationDiv) return;
    const confettiCount = 20; // 每批生成的纸屑数量
    const colors = ['#ff5f6d', '#00b09b', '#4facfe', '#a78bfa', '#fcd34d', '#ff9a9e', '#fad0c4', '#a1c4fd', '#c2e9fb', '#d4fc79']; // 更多颜色
    const types = ['square', 'circle', 'triangle']; // 示例：不同形状 (需要对应 CSS)

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        // confetti.classList.add('confetti', types[Math.floor(Math.random() * types.length)]); // 如果有不同形状
        confetti.classList.add('confetti'); // 沿用单一样式
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.backgroundColor = randomColor;

        // 随机起始水平位置 (稍微超出屏幕左/右)
        const startX = Math.random() * 120 - 10; // -10% to 110% of viewport width
        confetti.style.left = startX + 'vw';
        // 随机起始垂直位置 (屏幕顶部附近)
        confetti.style.top = -10 - (Math.random() * 20) + 'vh'; // -10vh to -30vh

        const size = Math.random() * 10 + 5; // 5px to 15px
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';

        const duration = Math.random() * 3 + 2; // 2s to 5s 动画时长
        confetti.style.animationDuration = duration + 's';
        const delay = Math.random() * 3; // 0s to 3s 动画延迟
        confetti.style.animationDelay = delay + 's';

        // 增加一些旋转让动画更生动
         const startRotate = Math.random() * 360;
         const endRotate = startRotate + (Math.random() > 0.5 ? 360 : -360); // 随机顺/逆时针旋转一周
         confetti.style.setProperty('--start-rotate', `${startRotate}deg`);
         confetti.style.setProperty('--end-rotate', `${endRotate}deg`);

        celebrationDiv.appendChild(confetti);

        // 动画结束时移除 DOM 元素
        confetti.addEventListener('animationend', () => { confetti.remove(); });
    }
}

// --- Edit/Delete Modal Functions ---

// 打开修改信息模态框
// 可以在 Step 5 点击某个按钮时调用，可能需要传入当前成员的唯一标识（如 maimaiId）
function openEditModal() {
   // TODO: 如果希望在打开时加载当前用户信息，需要一个 API 来获取当前用户信息
   // 或者让用户自己输入 maimaiId 和 QQ 来拉取信息（更复杂）
   // 目前简化处理：用户直接输入 maimaiId 和 QQ 进行验证和修改
   state.editAuthMaimaiId = null;
   state.editAuthQqNumber = null;
   state.editNewNickname = null;
   state.editNewQqNumber = null;
   state.editNewColor = null;
   state.editNewJob = null;
   state.editNewAvatarFile = null;
   state.editNewAvatarPreviewUrl = null;
   state.editClearAvatarFlag = false;
   state.errorMessage = null; // Clear error messages when opening modal
   state.showEditModal = true;
}

// 关闭修改信息模态框
function closeEditModal() {
   state.showEditModal = false;
   state.errorMessage = null; // Clear errors on close
   // Clean up avatar preview URL specific to the modal
    if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        state.editNewAvatarPreviewUrl = null;
    }
    // Optionally reset form fields if you don't want them to persist on next open
    // openEditModal(); // This would reset fields but doesn't change modal visibility
}

// 处理模态框中的新头像文件选择和预览
function handleEditAvatarChange(event) {
    const file = event.target.files?.[0];
    state.errorMessage = null; // Clear previous errors

    if (!file) {
        state.editNewAvatarFile = null;
         if (state.editNewAvatarPreviewUrl) {
            URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        }
        state.editNewAvatarPreviewUrl = null;
        return;
    }

    // 文件类型和大小检查 (与 Step 4 相同)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
     if (!allowedTypes.includes(file.type)) {
         state.errorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
         event.target.value = '';
         state.editNewAvatarFile = null;
         return;
     }
     const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
     if (file.size > sizeLimitBytes) {
         state.errorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         event.target.value = '';
         state.editNewAvatarFile = null;
         return;
     }

    state.editNewAvatarFile = file;

    // 生成预览 URL
     if (state.editNewAvatarPreviewUrl) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }
     state.editNewAvatarPreviewUrl = URL.createObjectURL(file);
     console.log("Edit modal: Avatar file selected:", file.name, "Preview URL:", state.editNewAvatarPreviewUrl);

     // 如果选择了新文件，取消“清空头像”标记
     state.editClearAvatarFlag = false;
}

// 移除模态框中选中的新头像文件
function removeEditAvatar() {
    state.editNewAvatarFile = null;
    if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        state.editNewAvatarPreviewUrl = null;
    }
    // Reset the file input element visually if needed (might require a ref or key)
     const editAvatarInput = document.getElementById('edit-avatar-upload');
     if(editAvatarInput) editAvatarInput.value = null; // Clear the file input value

     console.log("Edit modal: New avatar file removed.");
}

// 提交修改信息 (API: PATCH /api/members/:maimaiId)
async function saveChanges() {
    state.errorMessage = null;
     // Check required auth fields
    if (!state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()) {
         state.errorMessage = '请输入舞萌ID和当前QQ号进行验证。';
         return;
    }
     // Validate auth QQ format
    if (!/^[1-9][0-9]{4,14}$/.test(state.editAuthQqNumber.trim())) {
         state.errorMessage = '验证QQ号码格式不正确。';
         return;
    }
     // Validate new QQ format if provided
     if (state.editNewQqNumber?.trim() && !/^[1-9][0-9]{4,14}$/.test(state.editNewQqNumber.trim())) {
         state.errorMessage = '请输入有效的QQ号码（修改）。';
         return;
     }
     // Validate new nickname length if provided
     if (state.editNewNickname?.trim() && (state.editNewNickname.trim().length === 0 || state.editNewNickname.trim().length > 50)) {
          state.errorMessage = '新昵称长度需在1到50个字符之间。';
          return;
     }

    state.showLoadingOverlay = true;

    try {
        const formData = new FormData();
        // Append authentication credentials first
        formData.append('qqNumberAuth', state.editAuthQqNumber.trim());

        // Append only the fields that the user has potentially changed or filled
        // Trim values to avoid sending whitespace-only updates
        if (state.editNewNickname !== null && state.editNewNickname.trim() !== '') formData.append('nickname', state.editNewNickname.trim());
        if (state.editNewQqNumber !== null && state.editNewQqNumber.trim() !== '') formData.append('qqNumber', state.editNewQqNumber.trim());
        if (state.editNewColor !== null && state.editNewColor !== '') formData.append('color', state.editNewColor);
        if (state.editNewJob !== null && state.editNewJob !== '') formData.append('job', state.editNewJob);

        // Handle avatar changes
        if (state.editNewAvatarFile) {
            // If a new file is selected, append it and explicitly set clearAvatar=false
            formData.append('avatarFile', state.editNewAvatarFile);
            formData.append('clearAvatar', 'false'); // New file overrides clear
             console.log("Appending new avatar file for update.");
        } else if (state.editClearAvatarFlag) {
            // If no new file, but clear flag is true, append clearAvatar=true
            formData.append('clearAvatar', 'true');
             console.log("Appending clearAvatar=true for update.");
        }
        // If neither a new file is selected nor clearAvatar is checked, do nothing about avatar.

        console.log("Sending PATCH request to:", `${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`);
        // Log formData contents (for debugging)
        // for (let [key, value] of formData.entries()) { console.log(`${key}: ${value}`); }

         const response = await fetch(`${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`, {
             method: 'PATCH',
             // NO Content-Type header when sending FormData, browser handles it
             mode: 'cors',
             body: formData, // Send FormData
         });

        const data = await response.json();

        if (!response.ok) {
             console.error('API error saving changes:', response.status, data);
             throw new Error(data.error || `保存修改失败 (${response.status})`);
        }

        console.log('Changes saved successfully:', data);
        state.errorMessage = '信息更新成功！'; // Success message

        // Update the member list in state if the response includes the updated member
        // Assumes the backend returns the updated member object under `data.member`
         if (data.member) {
             // Find the index of the member in the completionAllMembers array
             const index = state.completionAllMembers.findIndex(m => (m.maimai_id || m.maimaiId) === (data.member.maimai_id || data.member.maimaiId));
             if (index !== -1) {
                 // Update the member object in the array using reactive Vue method
                 state.completionAllMembers[index] = { ...state.completionAllMembers[index], ...data.member };
                 console.log("Updated member in completionAllMembers array.");
             } else {
                console.warn("Updated member not found in completionAllMembers array after PATCH.");
                // Fallback: Re-fetch the whole team data if needed (more complex)
                // await fetchTeamData(state.teamCode); // Need a separate function for this
             }
             // Also update currentTeamMembers if they are currently displayed (e.g., if user goes back)
             const indexCurrent = state.currentTeamMembers.findIndex(m => (m.maimai_id || m.maimaiId) === (data.member.maimai_id || data.member.maimaiId));
              if (indexCurrent !== -1) {
                   // Note: currentTeamMembers in step 2/3 only have color, job, nickname, avatar_url
                  state.currentTeamMembers[indexCurrent] = {
                       ...state.currentTeamMembers[indexCurrent],
                       color: data.member.color,
                       job: data.member.job,
                       nickname: data.member.nickname,
                       avatar_url: data.member.avatar_url, // Update avatar URL here too
                   };
              }
         }

        // Close the modal after successful save
        closeEditModal(); // Will also clean up modal avatar preview

    } catch (e) {
        console.error('Fetch error saving changes:', e);
        state.errorMessage = e.message || '保存修改失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 删除报名信息 (API: DELETE /api/members/:maimaiId)
async function deleteEntry() {
     state.errorMessage = null;
     // Check required auth fields
    if (!state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()) {
         state.errorMessage = '请输入舞萌ID和当前QQ号进行验证才能删除。';
         return;
    }
      // Validate auth QQ format
    if (!/^[1-9][0-9]{4,14}$/.test(state.editAuthQqNumber.trim())) {
         state.errorMessage = '验证QQ号码格式不正确。';
         return;
    }

    // Show a confirmation dialog before proceeding
    if (!window.confirm(`确定要删除 Maimai ID 为 "${state.editAuthMaimaiId.trim()}" 的报名信息吗？此操作无法撤销！`)) {
        console.log("Delete cancelled by user.");
        return; // User cancelled
    }

    state.showLoadingOverlay = true;

    try {
         const response = await fetch(`${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`, {
             method: 'DELETE',
             headers: {
                 'Content-Type': 'application/json', // DELETE request with JSON body needs this header
             },
             mode: 'cors',
             body: JSON.stringify({ // Send authentication QQ number in the body
                 qqNumberAuth: state.editAuthQqNumber.trim(),
             }),
         });

         // DELETE might return 204 No Content on success, or JSON on error
         if (response.status === 204) {
             console.log('Deletion successful (received 204 No Content).');
             state.errorMessage = '报名信息已成功删除。'; // Success message

              // Remove the deleted member from the completionAllMembers array
             state.completionAllMembers = state.completionAllMembers.filter(
                  member => (member.maimai_id || member.maimaiId) !== state.editAuthMaimaiId.trim()
             );
              // Also remove from currentTeamMembers if applicable
             state.currentTeamMembers = state.currentTeamMembers.filter(
                 member => (member.maimai_id || member.maimaiId) !== state.editAuthMaimaiId.trim()
             );

             // If the deleted member was the last one, maybe redirect or show different message?
             if (state.completionAllMembers.length === 0) {
                  console.log("Team is now empty after deletion.");
                  // Optional: Go back to step 1 or home page if the team is now empty
                  setTimeout(goHome, 2000); // Go home after a short delay
             }

             // Close the modal and potentially go back to a relevant step or homepage
             closeEditModal();
             // If user deleted their own entry and team is empty, maybe go home...
             // If they deleted someone else's or team isn't empty, stay on step 5
             // For simplicity, let's just close the modal and update the list.
             // If the team is empty, goHome is called via the check above.

         } else if (response.ok) {
             // Should ideally be 204, but handle other 2xx if backend changes
             const data = await response.json();
              console.log('Deletion successful (unexpected 2xx):', data);
              state.errorMessage = '报名信息已成功删除。'; // Success message - adjust if needed
              // Update lists similar to the 204 case
              state.completionAllMembers = state.completionAllMembers.filter(
                   member => (member.maimai_id || member.maimaiId) !== state.editAuthMaimaiId.trim()
              );
               state.currentTeamMembers = state.currentTeamMembers.filter(
                  member => (member.maimai_id || member.maimaiId) !== state.editAuthMaimaiId.trim()
               );
              closeEditModal();
              if (state.completionAllMembers.length === 0) { setTimeout(goHome, 2000); }

         } else {
             // Handle error response (non-2xx/non-204)
             const data = await response.json(); // Expect error details in JSON
             console.error('API error deleting entry:', response.status, data);
             throw new Error(data.error || `删除信息失败 (${response.status})`);
         }

    } catch (e) {
        console.error('Fetch error deleting entry:', e);
         let errorMsg = e.message || '删除失败，请稍后再试。';
         // Specific error message for auth failure in delete
         if (e.message.includes('Authorization failed')) {
             errorMsg = 'Maimai ID 或 QQ 号不匹配，无法验证身份。';
         }
        state.errorMessage = errorMsg;
    } finally {
        state.showLoadingOverlay = false;
    }
}

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

    // PC 居中问题：Flexbox 布局已经在 root div 和 .container 上应用，
    // 如果依然不居中，可能是父级元素或全局 CSS 影响了 flex 布局或宽度。
    // 检查 body, html 的 height/min-height 属性是否允许 flex 容器撑满屏幕。
    // 确保没有其他 CSS 规则覆盖了 flexbox 属性或 container 的 margin/max-width。
});

onUnmounted(() => {
    // 清理 confetti 定时器
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
    // 清理 Step 4 头像预览 Object URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
    // 清理编辑模态框头像预览 Object URL
     if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
    }
});

/*
// Optional: Watch for changes in currentTeamMembers to update disabled status dynamically
watch(() => state.currentTeamMembers, (newMembers) => {
    console.log("currentTeamMembers updated:", newMembers);
    // Recalculate disabled states if needed, should already be reactive via computed properties
}, { deep: true });
*/

</script>

<template>
    <!-- 根容器，使用 flex 居中内容 -->
    <!-- Added more responsive padding and ensured full height -->
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8 overflow-hidden relative"> <!-- overflow hidden to prevent layout shift from confetti -->

        <!-- Main Content Container -->
        <!-- Use max-w-md for larger breakpoint, always mx-auto for centering -->
        <div class="w-full max-w-md mx-auto">
             <!-- Adjust z-index to control stacking order -->
            <div class="relative z-10"> <!-- Content should be above confetti -->

            <!-- 进度条 (步骤 2-4 可见) -->
            <div class="mb-8" v-if="state.currentStep > 1 && state.currentStep < 5">
                <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
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
             <!-- Use fade-in-up for transition -->
             <transition name="fade-in-up">
                 <div v-if="state.errorMessage" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-center" role="alert">
                     <img src="https://unpkg.com/lucide-static@latest/icons/alert-triangle.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0" alt="Error">
                     <span class="break-words">{{ state.errorMessage }}</span> <!-- Allow text to wrap -->
                </div>
             </transition>

            <!-- Step 1: 组队码输入 -->
            <div id="step-team-code" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 1"> <!-- Use v-if for cleaner DOM -->
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
                        class="input-code w-full bg-gray-800 bg-opacity-50 glass rounded-lg py-4 px-6 text-2xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center tracking-[0.5em]"
                        @input="(event) => state.teamCode = event.target.value.replace(/[^0-9]/g, '')"
                        @keydown.enter="handleContinue"
                    >
                    <p class="mt-2 text-xs text-gray-400">不存在的组队码将自动创建新队伍</p>
                </div>

                <!-- Continue Button -->
                <button @click="handleContinue" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300">
                    继续
                </button>
            </div>

            <!-- Step 2: 颜色选择 -->
            <div id="step-color-selection" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 2">
                <!-- Header -->
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold mb-2">选择你的颜色</h1>
                    <p class="text-purple-300">每个队伍中的颜色必须唯一</p>
                </div>

                <!-- Team Info Box -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
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
                             <img src="https://unpkg.com/lucide-static@latest/icons/flame.svg" class="w-10 h-10 text-white" :alt="getColorText('red')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('red') }}</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'green', 'disabled-option': isColorDisabled('green') }"
                         @click="selectColor('green')" @keydown.enter="selectColor('green')" @keydown.space="selectColor('green')">
                        <div class="color-green-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-green-shadow">
                             <img src="https://unpkg.com/lucide-static@latest/icons/leaf.svg" class="w-10 h-10 text-white" :alt="getColorText('green')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('green') }}</p>
                    </div>
                     <div role="button" tabindex="0" class="color-option"
                         :class="{ selected: state.selectedColor === 'blue', 'disabled-option': isColorDisabled('blue') }"
                         @click="selectColor('blue')" @keydown.enter="selectColor('blue')" @keydown.space="selectColor('blue')">
                        <div class="color-blue-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center color-blue-shadow">
                             <img src="https://unpkg.com/lucide-static@latest/icons/droplets.svg" class="w-10 h-10 text-white" :alt="getColorText('blue')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getColorText('blue') }}</p>
                    </div>
                </div>

                <!-- Current Members Box (Compact display) -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-purple-300">当前队伍成员</h3>
                    <div class="space-y-3 max-h-32 overflow-y-auto"> <!-- Added max height and overflow -->
                         <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                        <div v-else v-for="member in state.currentTeamMembers" :key="member.nickname + member.color + member.job /* Better key */" class="flex items-center">
                             <!-- Avatar or Icon -->
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
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(member.color)">
                              </div>

                            <div>
                                <p class="font-medium text-sm">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                     <span class="flex items-center mr-2">
                                         <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                     </span>
                                    <span class="flex items-center">
                                        <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                    </span>
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
            <div id="step-job-selection" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 3">
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
                            <div :class="`color-${state.selectedColor}-bg`" class="rounded-full w-5 h-5 flex items-center justify-center mr-2 flex-shrink-0 shadow-sm">
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-3 h-3 text-white" :alt="getColorText(state.selectedColor)">
                            </div>
                            <span class="text-xs font-medium text-gray-200">{{ getColorText(state.selectedColor) || '颜色' }}</span>
                        </div>
                    </div>
                </div>

                <!-- Job Options Grid -->
                 <div class="grid grid-cols-3 gap-4 mb-8">
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'attacker', 'disabled-option': isJobDisabled('attacker') }"
                         @click="selectJob('job-attacker');" @keydown.enter="selectJob('job-attacker')" @keydown.space="selectJob('job-attacker')">
                         <div class="job-attacker-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/swords.svg" class="w-10 h-10 text-white" :alt="getJobText('attacker')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('attacker') }}</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'defender', 'disabled-option': isJobDisabled('defender') }"
                         @click="selectJob('job-defender')" @keydown.enter="selectJob('job-defender')" @keydown.space="selectJob('job-defender')">
                         <div class="job-defender-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/shield.svg" class="w-10 h-10 text-white" :alt="getJobText('defender')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('defender') }}</p>
                    </div>
                    <div role="button" tabindex="0" class="job-option"
                         :class="{ selected: state.selectedJob === 'supporter', 'disabled-option': isJobDisabled('supporter') }"
                         @click="selectJob('job-supporter')" @keydown.enter="selectJob('job-supporter')" @keydown.space="selectJob('job-supporter')">
                        <div class="job-supporter-bg rounded-full w-20 h-20 mx-auto mb-2 flex items-center justify-center job-shadow">
                            <img src="https://unpkg.com/lucide-static@latest/icons/heart-pulse.svg" class="w-10 h-10 text-white" :alt="getJobText('supporter')">
                        </div>
                        <p class="text-center font-medium text-sm">{{ getJobText('supporter') }}</p>
                    </div>
                </div>

                <!-- Current Members Box (Compact display) -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                     <h3 class="text-sm font-medium mb-3 text-purple-300">当前队伍成员</h3>
                    <div class="space-y-3 max-h-32 overflow-y-auto"> <!-- Added max height and overflow -->
                         <div v-if="state.currentTeamMembers.length === 0" class="text-center text-gray-500 text-sm py-2">暂无其他成员</div>
                        <div v-else v-for="member in state.currentTeamMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                              <!-- Avatar or Icon -->
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
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(member.color)">
                              </div>

                            <div>
                                <p class="font-medium text-sm">{{ member.nickname }}</p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                     <span class="flex items-center mr-2">
                                         <span :class="`color-indicator color-${member.color}-bg`"></span>{{ getColorText(member.color) }}
                                     </span>
                                    <span class="flex items-center">
                                        <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job)"> {{ getJobText(member.job) }}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                <button @click="showStep(4)" :disabled="!state.selectedJob" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <button type="button" @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- Step 4: 个人信息 (Updated with Avatar Upload) -->
            <div id="step-personal-info" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 4">
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
                                 <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(state.selectedColor)}.svg`" class="w-4 h-4 text-white" :alt="getColorText(state.selectedColor)">
                             </div>
                             <p class="text-xs font-medium text-gray-200">{{ getColorText(state.selectedColor) || '颜色' }}</p>
                        </div>
                         <!-- Job -->
                         <div class="text-center flex flex-col items-center">
                            <div :class="`job-${state.selectedJob}-bg`" class="rounded-full p-2 mb-1 shadow-md job-summary-shadow flex-shrink-0">
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(state.selectedJob)}.svg`" class="w-4 h-4 text-white" :alt="getJobText(state.selectedJob)">
                            </div>
                             <p class="text-xs font-medium text-gray-200">{{ getJobText(state.selectedJob) || '职业' }}</p>
                        </div>
                    </div>
                </div>

                <!-- Form -->
                 <!-- Use form tag with @submit.prevent -->
                 <form @submit.prevent="handleSubmitPersonalInfo">

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
                            <label for="avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                {{ state.avatarFile ? '更换头像' : '选择图片' }}
                            </label>
                            <!-- Hidden file input -->
                            <input type="file" id="avatar-upload" @change="handleAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden">

                            <button v-if="state.avatarFile" type="button" @click="handleAvatarChange({ target: { files: [] }})" class="text-xs text-red-400 hover:text-red-500 transition">移除头像</button>
                        </div>
                    </div>

                    <!-- Other Fields -->
                    <div class="mb-4">
                        <label for="maimai-id" class="block text-sm font-medium text-purple-300 mb-2">舞萌ID <span class="text-red-500">*</span></label>
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：1234567890123" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="13">
                         <p class="mt-1 text-xs text-gray-400">用于唯一识别你的报名信息，未来修改/删除时需提供</p>
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：小明" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                    </div>

                    <div class="mb-6">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="qq-number" v-model="state.qqNumber" required placeholder="方便队长联系 (非0开头，5-15位数字)" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15">
                         <p class="mt-1 text-xs text-gray-400">用于验证你的身份，请务必准确填写。</p>
                    </div>

                    <!-- Privacy Agreement -->
                     <div class="mb-6">
                        <label class="flex items-start cursor-pointer">
                            <!-- Use native checkbox and v-model -->
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-500 rounded bg-gray-700 outline-none">
                             <span class="text-xs text-gray-300 select-none">我已阅读并同意<a href="#" @click.prevent class="text-purple-400 hover:underline font-medium">隐私政策</a>，允许收集和使用我的QQ号用于组队联系、身份验证目的。<span class="text-red-500">*</span></span>
                        </label>
                    </div>

                    <!-- Action Buttons -->
                    <!-- Disable button if not privacyAgreed or loading -->
                    <button type="submit" :disabled="!state.privacyAgreed || state.showLoadingOverlay" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :class="{'opacity-50 cursor-not-allowed': !state.privacyAgreed || state.showLoadingOverlay}">
                         {{ state.showLoadingOverlay ? '正在完成...' : '完成注册' }}
                    </button>

                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                        返回
                    </button>
                </form>
            </div>

            <!-- Step 5: 完成页面 (Updated with Avatar Display and Edit Button) -->
            <div id="step-completion" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 5">
                 <!-- Progress Bar (Completed) -->
                <div class="mb-8">
                    <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
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

                <!-- Final Member List (Updated with Avatar, Maimai ID needed for "You" tag) -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-purple-300">队伍成员</h3>
                    <div class="space-y-3 max-h-48 overflow-y-auto"> <!-- Added max height and overflow -->
                         <div v-if="state.completionAllMembers.length === 0" class="text-center text-gray-500 text-sm py-2">队伍信息加载中...</div>
                         <div v-else v-for="member in state.completionAllMembers" :key="member.maimai_id || member.maimaiId || member.nickname /* Use maimaiId or combined as key */" class="flex items-center relative">
                             <!-- Avatar or Icon -->
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
                                 <!-- Check against both maimai_id (from DB) and maimaiId (from user input state) -->
                                <p class="font-medium text-sm flex items-center">
                                    {{ member.nickname }}
                                    <span v-if="(member.maimai_id || member.maimaiId) === state.maimaiId" class="ml-2 text-xs bg-purple-600 px-1.5 py-0.5 rounded text-white font-bold">你</span>
                                </p>
                                <p class="text-xs text-gray-300 flex items-center flex-wrap">
                                    <span class="flex items-center mr-2">
                                        <span :class="`color-indicator color-${member.color}-bg`"></span>
                                        {{ getColorText(member.color) }}
                                    </span>
                                    <span class="flex items-center">
                                         <img :src="`https://unpkg.com/lucide-static@latest/icons/${getJobIcon(member.job)}.svg`" class="w-3 h-3 inline-block mr-1 flex-shrink-0" :alt="getJobText(member.job)">
                                        {{ getJobText(member.job) }}
                                    </span>
                                </p>
                                 <!-- Maybe display Maimai ID here? -->
                                 <!-- <p class="text-xs text-gray-500">{{ member.maimai_id || member.maimaiId }}</p> -->
                            </div>
                        </div>
                    </div>
                     <!-- Button to trigger Edit Modal -->
                     <div class="mt-6 text-center">
                         <button @click="openEditModal" class="bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center mx-auto">
                             <img src="https://unpkg.com/lucide-static@latest/icons/edit.svg" class="w-4 h-4 mr-2" alt="Edit">
                             修改我的报名信息
                         </button>
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
                             type="button"
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
                <button type="button" @click="goHome" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回首页
                </button>
            </div> <!-- End of Step 5 -->

             </div> <!-- End of relative z-10 block -->

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8 relative z-10"> <!-- Ensure footer is above confetti -->
                <!-- 使用环境变量中的域名 -->
                 <p>© {{ new Date().getFullYear() }} MPAM-Lab | <a :href="websiteLink" target="_blank" rel="noopener noreferrer" class="hover:text-purple-400">{{ websiteLink.replace(/^https?:\/\/(www\.)?/, '') }}</a></p> <!-- Remove www. if present -->
            </div>

        </div> <!-- End of Container -->

        <!-- Modals -->
        <!-- Confirm Join Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6 text-sm text-gray-200">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍。当前成员 <span class="font-bold">{{ state.currentTeamMembers.length }}</span>/3。</p>
                 <!-- Display members in confirm modal (compact) -->
                 <div v-if="state.currentTeamMembers.length > 0" class="mb-4 space-y-2 max-h-24 overflow-y-auto text-xs border-t border-b border-gray-700 py-2 px-1">
                     <span class="font-semibold text-purple-300 block mb-1">现有成员:</span>
                     <div v-for="member in state.currentTeamMembers" :key="member.nickname + member.color + member.job" class="flex items-center">
                         <!-- Avatar or Icon -->
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
                                <img :src="`https://unpkg.com/lucide-static@latest/icons/${getColorIcon(member.color)}.svg`" class="w-3 h-3 text-white" :alt="getColorText(member.color)">
                              </div>
                         <!-- Name and Details -->
                         <span class="text-gray-300">{{ member.nickname }} ({{ getColorText(member.color) }}, {{ getJobText(member.job) }})</span>
                     </div>
                 </div>
                 <p v-else class="mb-4 text-sm text-gray-400 italic">队伍目前还没有成员。</p>

                <div class="flex space-x-4">
                    <button type="button" @click="state.showConfirmModal = false; state.showLoadingOverlay = false;" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button type="button" @click="confirmJoinTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium">
                        确认加入
                    </button>
                </div>
            </div>
        </div>

        <!-- Create Team Modal -->
       <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm" v-show="state.showCreateModal">
           <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700">
                <h3 class="text-xl font-bold mb-4">创建新队伍</h3>
                <p class="mb-4 text-sm text-gray-200">组队码 <span class="font-bold text-purple-400">{{ state.teamCode }}</span> 未被使用。请为你的队伍命名：</p>
                <div class="mb-6">
                    <label for="newTeamName" class="block text-sm font-medium text-purple-300 mb-2">队伍名称 <span class="text-red-500">*</span></label>
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：银河战舰" class="w-full form-input rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="20" @keydown.enter="createNewTeam">
                     <p v-if="state.errorMessage && state.showCreateModal" class="mt-2 text-xs text-red-400">{{ state.errorMessage }}</p>
                </div>
                <div class="flex space-x-4">
                    <button type="button" @click="state.showCreateModal = false; state.errorMessage = null;" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium">
                        取消
                    </button>
                    <button type="button" @click="createNewTeam" :disabled="!state.newTeamName?.trim()" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium" :class="{'opacity-50 cursor-not-allowed': !state.newTeamName?.trim()}">
                        确认创建
                    </button>
                </div>
            </div>
        </div>

        <!-- New: Edit/Delete Member Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showEditModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8"> <!-- Added some margin for scroll -->
                <h3 class="text-xl font-bold mb-4 text-center">修改我的信息</h3>
                 <p class="mb-6 text-sm text-gray-300 text-center">请验证你的身份后修改或删除信息。</p>

                 <!-- Authentication Fields -->
                 <div class="mb-6">
                     <h4 class="text-md font-semibold mb-3 text-purple-300">身份验证</h4>
                    <div class="mb-4">
                        <label for="edit-auth-maimai-id" class="block text-sm font-medium text-purple-300 mb-2">你的舞萌ID <span class="text-red-500">*</span></label>
                        <input
                            type="text"
                            id="edit-auth-maimai-id"
                            v-model="state.editAuthMaimaiId"
                            required
                             placeholder="注册时使用的舞萌ID"
                            class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                            maxlength="13"
                        >
                    </div>
                    <div class="mb-4">
                        <label for="edit-auth-qq-number" class="block text-sm font-medium text-purple-300 mb-2">你的当前QQ号 <span class="text-red-500">*</span></label>
                        <input
                            type="text"
                            inputmode="numeric"
                            id="edit-auth-qq-number"
                            v-model="state.editAuthQqNumber"
                            required
                            placeholder="注册时使用的QQ号"
                            class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                            pattern="[1-9][0-9]{4,14}"
                            maxlength="15"
                        >
                         <p class="mt-1 text-xs text-gray-400">用于验证你是信息的所有者。</p>
                    </div>
                 </div>
                 <hr class="my-6 border-gray-700">

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
                             <label for="edit-avatar-upload" class="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300">
                                 {{ state.editNewAvatarFile ? '更换头像' : '选择图片' }}
                             </label>
                             <!-- Hidden file input -->
                             <input type="file" id="edit-avatar-upload" @change="handleEditAvatarChange" accept="image/png, image/jpeg, image/gif, image/webp" class="hidden">
                             <p class="text-xs text-gray-400">支持 JPG, PNG, GIF, 最大 2MB</p>

                             <!-- Option to clear existing avatar -->
                             <label class="flex items-center cursor-pointer text-xs text-gray-300 hover:text-white transition">
                                 <input type="checkbox" v-model="state.editClearAvatarFlag" class="mr-1 h-3 w-3 text-red-600 focus:ring-red-500 border-gray-500 rounded bg-gray-700 outline-none">
                                 移除当前头像 (如果已上传)
                             </label>
                         </div>
                     </div> <!-- End New Avatar Section -->

                    <div class="mb-4">
                        <label for="edit-nickname" class="block text-sm font-medium text-purple-300 mb-2">新称呼</label>
                        <input type="text" id="edit-nickname" v-model="state.editNewNickname" placeholder="留空不修改" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                    </div>

                    <div class="mb-4">
                        <label for="edit-qq-number" class="block text-sm font-medium text-purple-300 mb-2">新QQ号</label>
                        <input
                            type="text"
                            inputmode="numeric"
                            id="edit-qq-number"
                            v-model="state.editNewQqNumber"
                            placeholder="留空不修改"
                            class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none"
                            pattern="[1-9][0-9]{4,14}"
                            maxlength="15"
                        >
                    </div>

                    <div class="mb-4">
                        <label for="edit-color" class="block text-sm font-medium text-purple-300 mb-2">新颜色</label>
                        <select id="edit-color" v-model="state.editNewColor" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="">-- 留空不修改 --</option>
                             <!-- Use computed property for disabled status -->
                            <option value="red" :disabled="isColorDisabled('red')" :class="{'opacity-50': isColorDisabled('red')}">{{ getColorText('red') }}</option>
                            <option value="green" :disabled="isColorDisabled('green')" :class="{'opacity-50': isColorDisabled('green')}">{{ getColorText('green') }}</option>
                            <option value="blue" :disabled="isColorDisabled('blue')" :class="{'opacity-50': isColorDisabled('blue')}">{{ getColorText('blue') }}</option>
                        </select>
                    </div>

                    <div class="mb-4">
                        <label for="edit-job" class="block text-sm font-medium text-purple-300 mb-2">新职业</label>
                        <select id="edit-job" v-model="state.editNewJob" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="">-- 留空不修改 --</option>
                             <!-- Use computed property for disabled status -->
                             <option value="attacker" :disabled="isJobDisabled('attacker')" :class="{'opacity-50': isJobDisabled('attacker')}">{{ getJobText('attacker') }}</option>
                            <option value="defender" :disabled="isJobDisabled('defender')" :class="{'opacity-50': isJobDisabled('defender')}">{{ getJobText('defender') }}</option>
                            <option value="supporter" :disabled="isJobDisabled('supporter')" :class="{'opacity-50': isJobDisabled('supporter')}">{{ getJobText('supporter') }}</option>
                        </select>
                    </div>
                 </div>
                <hr class="my-6 border-gray-700">

                 <!-- Delete Section -->
                 <div class="mb-6 text-center">
                     <h4 class="text-md font-semibold mb-3 text-red-400">删除报名信息</h4>
                     <p class="text-sm text-gray-300 mb-4">此操作不可撤销。需要输入你的舞萌ID和当前QQ号。</p>
                    <button type="button" @click="deleteEntry" :disabled="isLoading || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()" class="btn-glow bg-red-600 hover:bg-red-700 rounded-lg py-3 px-6 font-bold transition duration-300 text-sm" :class="{'opacity-50 cursor-not-allowed': isLoading || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()}">
                         删除我的报名信息
                    </button>
                 </div>
                 <hr class="my-6 border-gray-700">

                <!-- Error message within modal -->
                <transition name="fade-in-up">
                <div v-if="state.errorMessage && state.showEditModal" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-center" role="alert">
                    <img src="https://unpkg.com/lucide-static@latest/icons/alert-triangle.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0" alt="Error">
                    <span class="break-words">{{ state.errorMessage }}</span>
                </div>
                </transition>

                <!-- Action Buttons -->
                 <div class="flex space-x-4 justify-center">
                     <button type="button" @click="closeEditModal" class="flex-1 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium max-w-[100px]">
                         取消
                     </button>
                    <button type="button" @click="saveChanges" :disabled="isLoading || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()" class="flex-1 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium max-w-[180px]" :class="{'opacity-50 cursor-not-allowed': isLoading || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()}">
                         {{ isLoading && !state.errorMessage ? '保存中...' : '保存更改' }}
                    </button>
                 </div>

            </div>
        </div>

        <!-- Loading Overlay (Keep as it is) -->
        <div class="loading-overlay z-[60]" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p class="mt-4 text-white">{{ state.errorMessage ? '发生错误' : '处理中，请稍候...' }}</p>
        </div>

         <!-- Celebration Container (Keep as it is. Lower z-index so content is above) -->
        <div class="celebration z-0" id="celebration"></div>

    </div> <!-- End of Root Container -->
</template>

<style scoped>
/* Custom styles FROM PREVIOUS CODE - COPY AND PASTE THIS ENTIRE BLOCK */
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
     z-index: 10; /* Ensure tooltip is slightly above */
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
    mask: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>') no-repeat center center;
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
    background-image: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="6 9 12 15 18 9"%3E%3C/polyline%3E%3C/svg%3E');
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
    /* width/height/color/animation set by JS */
    animation-name: confetti-fall; /* Explicitly name the animation */
    animation-timing-function: linear;
    animation-iteration-count: infinite; /* Make it continuous unless cleared */
    z-index: 1; /* Above background, below content */
    border-radius: 2px;
    /* mix-blend-mode: screen; Consider removing or adjusting based on desired effect */
    opacity: 0.8; /* Slightly less opaque */
    /* New: Add rotation properties */
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
/* Make confetti creation slightly more varied */
.confetti:nth-child(2n) { animation-timing-function: ease-out; }
.confetti:nth-child(3n) { animation-timing-function: cubic-bezier(0.1, 1, 0.1, 1); }

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
    width: 160px; /* Fit the 140px QR code + padding = 160*/
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

/* Responsive adjustments (Ensure main content is centered) */
/* The flex and mx-auto on the container already handle centering on most screen sizes */
/* You might still need to debug specific global CSS issues if centering fails */

/* Style for the edit modal confirmation button */
.modal-confirm-button {
     /* Define styles similar to btn-glow but perhaps smaller */
     /* Example: */
     /* background-color: #a78bfa; */
     /* color: white; */
     /* padding: 8px 16px; */
     /* border-radius: 8px; */
     /* font-weight: bold; */
     /* transition: background-color 0.3s ease; */
}
/* .modal-confirm-button:hover {
     background-color: #8b5cf6;
} */

/* Example styles for select box (if appearance: none is used) */
/* Need to add real styles for the custom arrow or let browser handle it */

/* Member list avatar border color based on role color */
/* Add these classes if using border-${color}-500 pattern */
/* Example */
.border-red-500 { border-color: #ef4444; }
.border-green-500 { border-color: #22c55e; }
.border-blue-500 { border-color: #3b82f6; }

/* Remove default body margin/padding if necessary */
/* html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    overflow-x: hidden;
} */
/* Ensure root element takes up full height */
/* #app {
    height: 100%;
    width: 100%;
} */
</style>