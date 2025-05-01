<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import QrcodeVue from 'qrcode.vue'; // 引入 QR Code 组件

// --- Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api';
const websiteLink = ref(import.meta.env.VITE_WEBSITE_LINK || 'http://localhost:5173');
const MAX_AVATAR_SIZE_MB = 2;

// --- State Management (Reactive) ---
const state = reactive({
    currentStep: 0, // MODIFIED: Start at step 0 (Entry Page)
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
    editAuthMaimaiId: null,
    editAuthQqNumber: null,
    editNewNickname: null,
    editNewQqNumber: null,
    editNewColor: null,
    editNewJob: null,
    editNewAvatarFile: null,
    editNewAvatarPreviewUrl: null,
    editClearAvatarFlag: false,
    showConfirmModal: false,
    showCreateModal: false,
    showLoadingOverlay: false,
    errorMessage: null,
    currentTeamMembers: [],
    completionAllMembers: [],
    confettiInterval: null,

    // Event Info 
    eventInfo: {
        title: "NGU 3rd 音游娱乐赛",
        location: "翡尔堡家庭娱乐中心(郑州万象城三楼店)",
        time: "2025年5月17日",
        description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque sollicitudin augue vel sem suscipit, id bibendum neque bibendum. Cras tempor non lacus ac vestibulum.",
        // rulesLink: "#"
    }
});

// --- Computed Properties ---
const progressWidth = computed(() => {
    // MODIFIED: Adjust steps for progress calculation (starts from step 2)
    const stepProgress = { 0: 0, 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };
    return `${stepProgress[state.currentStep]}%`;
});

// ... (isColorDisabled, isJobDisabled, shareLinkUrl 保持不变) ...
const isColorDisabled = computed(() => (color) => {
     if (state.showEditModal && state.editAuthMaimaiId) {
         const memberBeingEdited = state.currentTeamMembers.find(m => (m.maimai_id || m.maimaiId)?.toString() === state.editAuthMaimaiId?.toString());
         if (memberBeingEdited && memberBeingEdited.color === color) return false;
     }
    return state.currentTeamMembers.some(member => member.color === color);
});

const isJobDisabled = computed(() => (jobType) => {
     if (state.showEditModal && state.editAuthMaimaiId) {
         const memberBeingEdited = state.currentTeamMembers.find(m => (m.maimai_id || m.maimaiId)?.toString() === state.editAuthMaimaiId?.toString());
         if (memberBeingEdited && memberBeingEdited.job === jobType) return false;
     }
    return state.currentTeamMembers.some(member => member.job === jobType);
});

const shareLinkUrl = computed(() => {
    if (!state.teamCode) return '';
    const baseUrl = websiteLink.value.endsWith('/') ? websiteLink.value.slice(0, -1) : websiteLink.value;
    return `${baseUrl}/?code=${state.teamCode}`;
});

// --- Methods / Functions ---

// 导航到指定步骤
function showStep(stepNumber) {
    // MODIFIED: Check for leaving step 5 (Completion)
    if (state.currentStep === 5 && state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
        const celebrationDiv = document.getElementById('celebration');
        if(celebrationDiv) celebrationDiv.innerHTML = ''; // 清理 DOM
    }

    state.currentStep = stepNumber;
    state.errorMessage = null; // 切换步骤时清除错误信息

    // MODIFIED: Check for entering step 5 (Completion)
    if (stepNumber === 5) {
         setTimeout(() => {
             const celebrationDiv = document.getElementById('celebration');
             if(celebrationDiv) celebrationDiv.innerHTML = '';
             createConfetti();
             state.confettiInterval = setInterval(createConfetti, 2000);
         }, 100);
    }
}

// 处理输入组队码后的“继续”操作 (API: POST /api/teams/check)
async function handleContinue() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    state.errorMessage = null;

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
            body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('API error checking team:', response.status, response.statusText, data);
            throw new Error(data.error || `检查队伍失败 (${response.status})`);
        }

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
        console.error('Fetch error checking team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
    } finally {
       state.showLoadingOverlay = false;
       console.log('handleContinue finally: showLoadingOverlay set to', state.showLoadingOverlay);
    }
}

// 确认加入现有队伍 (从模态框点击确认)
function confirmJoinTeam() {
    state.showConfirmModal = false;
    // MODIFIED: Go to step 2 (Color Selection)
    showStep(2);
}

// 创建新队伍 (API: POST /api/teams/create)
async function createNewTeam() {
    const code = state.teamCode ? state.teamCode.trim() : '';
    const name = state.newTeamName ? state.newTeamName.trim() : '';
    state.errorMessage = null;

    if (!name || name.trim().length === 0 || name.trim().length > 50) {
        state.errorMessage = '队伍名称不能为空，且不能超过50个字符。';
        return;
    }
     if (!code || code.length !== 4 || isNaN(parseInt(code))) {
         state.errorMessage = '无效的组队码。';
         return;
     }

    state.showLoadingOverlay = true;

    try {
        const response = await fetch(`${API_BASE_URL}/teams/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify({ code, name: name.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
             console.error('API error creating team:', response.status, data);
             throw new Error(data.error || `创建队伍失败 (${response.status})`);
        }

        state.teamName = data.name;
        state.currentTeamMembers = [];
        state.showCreateModal = false;
        // MODIFIED: Go to step 2 (Color Selection)
        showStep(2);

    } catch (e) {
        console.error('Fetch error creating team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
        state.showCreateModal = false;
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
     const map = { red: '火', green: '木', blue: '水' };
     return map[colorId] || '';
}

// 获取本地 SVG 路径
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

// 选择职业
function selectJob(jobId) {
     const jobType = jobId.replace('job-', '');
    if (!isJobDisabled.value(jobType)) {
        state.selectedJob = jobType;
    }
}

// 获取职业显示文本
function getJobText(jobType) {
    const map = { attacker: '绝剑士', defender: '矩盾手', supporter: '炼星师' };
    return map[jobType] || '';
}

// Step 4: 处理头像文件选择和预览
function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    state.errorMessage = null;

    if (!file) {
        state.avatarFile = null;
        if (state.avatarPreviewUrl) {
            URL.revokeObjectURL(state.avatarPreviewUrl);
        }
        state.avatarPreviewUrl = null;
        return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        state.errorMessage = '请选择有效的图片文件 (PNG, JPG, GIF, WEBP)。';
        event.target.value = '';
        state.avatarFile = null;
         return;
    }
    const sizeLimitBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
        state.errorMessage = `图片大小不能超过 ${MAX_AVATAR_SIZE_MB}MB。`;
         event.target.value = '';
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

// step 4: 提交个人信息 (API: POST /api/teams/join)
async function handleSubmitPersonalInfo() {
    state.errorMessage = null;

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

    state.showLoadingOverlay = true;

    try {
        const formData = new FormData();
        formData.append('teamCode', state.teamCode.trim());
        formData.append('color', state.selectedColor);
        formData.append('job', state.selectedJob);
        formData.append('maimaiId', state.maimaiId.trim());
        formData.append('nickname', state.nickname.trim());
        formData.append('qqNumber', state.qqNumber.trim());

        if (state.avatarFile) {
            formData.append('avatarFile', state.avatarFile);
            console.log("Appending avatar file to FormData:", state.avatarFile.name);
        } else {
            console.log("No avatar file selected for join request.");
        }

        const response = await fetch(`${API_BASE_URL}/teams/join`, {
            method: 'POST',
            mode: 'cors',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
             console.error('API error joining team:', response.status, data);
              throw new Error(data.error || `加入队伍失败 (${response.status})`);
        }

        state.completionAllMembers = data.members || [];
        state.teamName = data.name;
        console.log("Successfully joined team. Data:", data);
        // MODIFIED: Go to step 5 (Completion)
        showStep(5);

    } catch (e) {
        console.error('Fetch error joining team:', e);
        state.errorMessage = e.message || '连接服务器失败，请稍后再试。';
         if (e.message.includes('Maimai ID already exists')) {
             state.errorMessage = '该舞萌ID已在该队伍中注册，请勿重复加入或选择修改/删除。';
         } else if (e.message.includes('team member limit')) {
             state.errorMessage = '队伍成员已满，无法加入。';
         }
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 复制分享链接
function copyShareLink() {
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

function handleCopyFeedback() {
     const copyBtn = document.getElementById('copyBtn');
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

function fallbackCopyTextToClipboard(text) {
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

// 返回首页并重置所有相关状态
function goHome() {
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
     if (state.editNewAvatarPreviewUrl) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }

    // MODIFIED: Reset currentStep to 0
    Object.assign(state, {
        currentStep: 0, // Reset to Entry Page
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
        editAuthMaimaiId: null,
        editAuthQqNumber: null,
        editNewNickname: null,
        editNewQqNumber: null,
        editNewColor: null,
        editNewJob: null,
        editNewAvatarFile: null,
        editNewAvatarPreviewUrl: null,
        editClearAvatarFlag: false,
        showConfirmModal: false,
        showCreateModal: false,
        showLoadingOverlay: false,
        errorMessage: null,
        currentTeamMembers: [],
        completionAllMembers: [],
        confettiInterval: null,
    });

    const celebrationDiv = document.getElementById('celebration');
    if(celebrationDiv) celebrationDiv.innerHTML = '';
    history.replaceState(null, '', window.location.pathname);
}

// Confetti 动画
function createConfetti() {
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
        confetti.addEventListener('animationend', () => { confetti.remove(); });
         setTimeout(() => confetti.remove(), duration * 1000 + delay * 1000 + 500);
    }
}

// --- Edit/Delete Modal Functions ---
function openEditModal(maimaiIdToEdit = null) {
   state.editAuthMaimaiId = maimaiIdToEdit !== null ? maimaiIdToEdit.toString() : null;
   state.editAuthQqNumber = null;
   state.editNewNickname = null;
   state.editNewQqNumber = null;
   state.editNewColor = null;
   state.editNewJob = null;
   state.editNewAvatarFile = null;
   if (state.editNewAvatarPreviewUrl) {
       URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
   }
   state.editNewAvatarPreviewUrl = null;
   state.editClearAvatarFlag = false;
   state.errorMessage = null;
   state.showEditModal = true;
   console.log("Edit modal opened. Pre-filled Maimai ID:", maimaiIdToEdit);
}
function closeEditModal() {
   console.log("Closing edit modal.");
   state.showEditModal = false;
   state.errorMessage = null;
    if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        state.editNewAvatarPreviewUrl = null;
    }
    state.editAuthMaimaiId = null;
    state.editAuthQqNumber = null;
    state.editNewNickname = null;
    state.editNewQqNumber = null;
    state.editNewColor = null;
    state.editNewJob = null;
    state.editNewAvatarFile = null;
    state.editClearAvatarFlag = false;
}
function handleEditAvatarChange(event) {
    const file = event.target.files?.[0];
    state.errorMessage = null;
    if (!file) {
        state.editNewAvatarFile = null;
         if (state.editNewAvatarPreviewUrl) {
            URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        }
        state.editNewAvatarPreviewUrl = null;
        state.editClearAvatarFlag = false;
         const editAvatarInput = document.getElementById('edit-avatar-upload');
         if(editAvatarInput) editAvatarInput.value = null;
        return;
    }
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
     if (state.editNewAvatarPreviewUrl) {
         URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
     }
     state.editNewAvatarPreviewUrl = URL.createObjectURL(file);
     console.log("Edit modal: Avatar file selected:", file.name, "Preview URL:", state.editNewAvatarPreviewUrl);
     state.editClearAvatarFlag = false;
}
function removeEditAvatar() {
    state.editNewAvatarFile = null;
    if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
        state.editNewAvatarPreviewUrl = null;
    }
     const editAvatarInput = document.getElementById('edit-avatar-upload');
     if(editAvatarInput) editAvatarInput.value = null;
     console.log("Edit modal: Selected new avatar file removed.");
}
async function saveChanges() {
    state.errorMessage = null;
    if (!state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()) {
         state.errorMessage = '请输入舞萌ID和当前QQ号进行验证才能保存。';
         return;
    }
    if (!/^[1-9][0-9]{4,14}$/.test(state.editAuthQqNumber.trim())) {
         state.errorMessage = '验证QQ号码格式不正确。';
         return;
    }
    if (state.editAuthMaimaiId.trim().length === 0 || state.editAuthMaimaiId.trim().length > 13) {
        state.errorMessage = '验证舞萌ID长度不正确 (应 ≤ 13位)。';
        return;
    }
     if (state.editNewQqNumber !== null && state.editNewQqNumber.trim() !== '' && !/^[1-9][0-9]{4,14}$/.test(state.editNewQqNumber.trim())) {
         state.errorMessage = '请输入有效的QQ号码（修改）。';
         return;
     }
      if (state.editNewNickname !== null && state.editNewNickname.trim() !== '' && (state.editNewNickname.trim().length === 0 || state.editNewNickname.trim().length > 50)) {
          state.errorMessage = '新称呼长度需在1到50个字符之间。';
          return;
      }
    state.showLoadingOverlay = true;
    try {
        const formData = new FormData();
        formData.append('qqNumberAuth', state.editAuthQqNumber.trim());
         if (state.editNewNickname !== null && state.editNewNickname.trim() !== '') formData.append('nickname', state.editNewNickname.trim());
         if (state.editNewQqNumber !== null && state.editNewQqNumber.trim() !== '') formData.append('qqNumber', state.editNewQqNumber.trim());
         if (state.editNewColor !== null && state.editNewColor !== '') formData.append('color', state.editNewColor);
         if (state.editNewJob !== null && state.editNewJob !== '') formData.append('job', state.editNewJob);
        if (state.editNewAvatarFile) {
            formData.append('avatarFile', state.editNewAvatarFile);
            formData.append('clearAvatar', 'false');
             console.log("Appending new avatar file for update.");
         } else if (state.editClearAvatarFlag) {
            formData.append('clearAvatar', 'true');
             console.log("Appending clearAvatar=true for update.");
         }
        console.log("Sending PATCH request to:", `${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`);
         const response = await fetch(`${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`, {
             method: 'PATCH',
             mode: 'cors',
             body: formData,
         });
        const data = await response.json();
        if (!response.ok) {
             console.error('API error saving changes:', response.status, data);
             let errorMsg = data.error || `保存修改失败 (${response.status})`;
             if (data.error?.includes('Authorization failed')) {
                 errorMsg = '舞萌ID 或 QQ 号不匹配，无法验证身份。';
             } else if (data.error?.includes('already taken')) {
                 errorMsg = '选择的颜色/职业已被队伍其他成员占用。';
             }
             throw new Error(errorMsg);
        }
        console.log('Changes saved successfully:', data);
        state.errorMessage = '信息更新成功！';
         if (data.member) {
             const updatedMaimaiId = data.member.maimai_id?.toString() || data.member.maimaiId?.toString();
             if (updatedMaimaiId) {
                 const indexCompletion = state.completionAllMembers.findIndex(m => (m.maimai_id || m.maimaiId)?.toString() === updatedMaimaiId);
                 if (indexCompletion !== -1) {
                      state.completionAllMembers[indexCompletion] = { ...state.completionAllMembers[indexCompletion], ...data.member };
                     console.log("Updated member in completionAllMembers array.");
                 } else {
                    console.warn("Updated member not found in completionAllMembers array after PATCH.");
                 }
                 const indexCurrent = state.currentTeamMembers.findIndex(m => (m.maimai_id || m.maimaiId)?.toString() === updatedMaimaiId);
                  if (indexCurrent !== -1) {
                      state.currentTeamMembers[indexCurrent] = {
                           ...state.currentTeamMembers[indexCurrent],
                           maimai_id: data.member.maimai_id,
                           nickname: data.member.nickname,
                           color: data.member.color,
                           job: data.member.job,
                           avatar_url: data.member.avatar_url,
                       };
                       console.log("Updated member in currentTeamMembers array.");
                  }
             } else {
                  console.warn("PATCH success response did not include a member object with maimai_id.");
             }
         }
         setTimeout(() => {
             closeEditModal();
             state.errorMessage = null;
         }, 1500);
    } catch (e) {
        console.error('Fetch error saving changes:', e);
        state.errorMessage = e.message || '保存修改失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}
async function deleteEntry() {
     state.errorMessage = null;
    if (!state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()) {
         state.errorMessage = '请输入舞萌ID和当前QQ号进行验证才能删除。';
         return;
    }
    if (!/^[1-9][0-9]{4,14}$/.test(state.editAuthQqNumber.trim())) {
         state.errorMessage = '验证QQ号码格式不正确。';
         return;
    }
     if (state.editAuthMaimaiId.trim().length === 0 || state.editAuthMaimaiId.trim().length > 13) {
         state.errorMessage = '验证舞萌ID长度不正确。';
         return;
     }
    if (!window.confirm(`确定要删除 Maimai ID 为 "${state.editAuthMaimaiId.trim()}" 的报名信息吗？此操作无法撤销！`)) {
        console.log("Delete cancelled by user via confirm dialog.");
        return;
    }
    state.showLoadingOverlay = true;
    try {
         const response = await fetch(`${API_BASE_URL}/members/${state.editAuthMaimaiId.trim()}`, {
             method: 'DELETE',
             headers: { 'Content-Type': 'application/json' },
             mode: 'cors',
             body: JSON.stringify({ qqNumberAuth: state.editAuthQqNumber.trim() }),
         });

         if (response.status === 204) {
             console.log('Deletion successful (received 204 No Content).');
             state.completionAllMembers = state.completionAllMembers.filter(
                  member => (member.maimai_id || member.maimaiId)?.toString() !== state.editAuthMaimaiId.trim()?.toString()
             );
             state.currentTeamMembers = state.currentTeamMembers.filter(
                 member => (member.maimai_id || member.maimaiId)?.toString() !== state.editAuthMaimaiId.trim()?.toString()
             );
             console.log(`Removed member ${state.editAuthMaimaiId.trim()} from local state.`);
              closeEditModal();
             state.errorMessage = '报名信息已成功删除！';
             if (state.showConfirmModal) {
                 state.showConfirmModal = false;
             }
             // MODIFIED: Check currentStep is 5 for completion page logic
             if (state.completionAllMembers.length === 0 && state.currentStep === 5) {
                  console.log("Team is now empty after deletion from Step 5. Navigating home.");
                  setTimeout(() => {
                       goHome();
                        state.errorMessage = null;
                  }, 2000);
             } else if (state.completionAllMembers.length > 0 && state.currentStep === 5) {
                   state.errorMessage = '报名信息已成功删除！队伍列表已更新。';
             } else {
                  console.log("Deletion happened from modal on a step other than 5.");
                  // MODIFIED: Check currentStep is 1 for team code page logic
                   if (!state.showConfirmModal && !state.showCreateModal && state.currentStep === 1) {
                         state.errorMessage = '报名信息已成功删除！';
                         setTimeout(() => { state.errorMessage = null; }, 3000);
                   }
             }
         } else if (response.ok) {
             const data = await response.json();
              console.log('Deletion successful (unexpected 2xx):', data);
               state.completionAllMembers = state.completionAllMembers.filter(
                   member => (member.maimai_id || member.maimaiId)?.toString() !== state.editAuthMaimaiId.trim()?.toString()
               );
               state.currentTeamMembers = state.currentTeamMembers.filter(
                  member => (member.maimai_id || member.maimaiId)?.toString() !== state.editAuthMaimaiId.trim()?.toString()
               );
              closeEditModal();
                state.errorMessage = '报名信息已成功删除！';
                if (state.showConfirmModal) state.showConfirmModal = false;
              // MODIFIED: Check currentStep is 5
              if (state.completionAllMembers.length === 0 && state.currentStep === 5) { setTimeout(() => { goHome(); state.errorMessage = null; }, 2000); }
         } else {
             const data = await response.json();
             console.error('API error deleting entry:', response.status, data);
             let errorMsg = data.error || `删除信息失败 (${response.status})`;
             if (data.error?.includes('Authorization failed')) {
                 errorMsg = '舞萌ID 或 QQ 号不匹配，无法验证身份。';
             } else if (data.error?.includes('not found')) {
                  errorMsg = '未找到匹配的报名信息。';
             }
            throw new Error(errorMsg);
         }
    } catch (e) {
        console.error('Fetch error deleting entry:', e);
         state.errorMessage = e.message || '删除失败，请稍后再试。';
    } finally {
        state.showLoadingOverlay = false;
    }
}

// 创建三角形背景函数
function createTriangleBackground() {
    const trianglesContainer = document.getElementById('triangles');
    if (!trianglesContainer) return;

    // 使用紫色系列颜色替代蓝色
    const colors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'];
    const triangleCount = 50;

    for (let i = 0; i < triangleCount; i++) {
        const triangle = document.createElement('div');
        triangle.classList.add('triangle');

        // 随机大小
        const size = Math.random() * 100 + 50;

        // 随机位置
        const left = Math.random() * 100;
        const top = Math.random() * 100 + 100; // 从底部开始

        // 随机颜色
        const color = colors[Math.floor(Math.random() * colors.length)];

        // 随机动画持续时间
        const duration = Math.random() * 30 + 20;

        // 随机动画延迟
        const delay = Math.random() * 30;

        // 设置三角形样式
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

onMounted(() => {
    // 页面加载时检查 URL 是否有组队码
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');

    if (codeParam && codeParam.length === 4 && !isNaN(parseInt(codeParam))) {
        state.teamCode = codeParam;
        // MODIFIED: Go to step 1 first, then trigger handleContinue
        showStep(1); // Show the team code input step
         setTimeout(() => {
             handleContinue(); // Auto-trigger check after showing the step
         }, 100);
    } else {
       // MODIFIED: Ensure initial step (0) is shown if no code param
       showStep(state.currentStep); // Should be 0 initially
    }
    // 创建三角形背景
    createTriangleBackground();
});

onUnmounted(() => {
    // Clean up confetti interval
    if (state.confettiInterval) {
        clearInterval(state.confettiInterval);
        state.confettiInterval = null;
         const celebrationDiv = document.getElementById('celebration');
         if(celebrationDiv) celebrationDiv.innerHTML = '';
    }
    // Clean up Step 4 avatar preview Object URL
    if (state.avatarPreviewUrl) {
        URL.revokeObjectURL(state.avatarPreviewUrl);
    }
    // Clean up edit modal avatar preview Object URL
     if (state.editNewAvatarPreviewUrl) {
        URL.revokeObjectURL(state.editNewAvatarPreviewUrl);
    }
    // 清理三角形背景
    const trianglesContainer = document.getElementById('triangles');
    if (trianglesContainer) {
        trianglesContainer.innerHTML = '';
    }
});

</script>

<template>
    <!-- Root container -->
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8 relative">
         <!-- 动态三角形背景 -->
         <div id="triangles" class="absolute inset-0 z-0 overflow-hidden"></div>
        <!-- Main Content Container -->
        <div class="w-full max-w-md mx-auto relative z-10">

            <!-- Progress Bar (Visible in steps 2-4) -->
            <!-- MODIFIED: v-if condition changed -->
            <div class="mb-8" v-if="state.currentStep >= 2 && state.currentStep < 5">
                <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
                    <!-- MODIFIED: Highlight logic adjusted for new steps -->
                    <span :class="{'text-white font-bold': state.currentStep >= 1}">组队码</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 2}">颜色</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 3}">职业</span>
                    <span :class="{'text-white font-bold': state.currentStep >= 4}">个人信息</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: progressWidth }"></div>
                </div>
            </div>

             <!-- Error message display area -->
             <transition name="fade-in-up">
                 <div v-if="state.errorMessage && (!state.showConfirmModal && !state.showCreateModal && !state.showEditModal  && !state.showLoadingOverlay)" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                     <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                     <span class="break-words flex-grow">{{ state.errorMessage }}</span>
                    <button type="button" class="ml-2 -mt-1 text-gray-300 hover:text-white transition-colors" @click="state.errorMessage = null" aria-label="关闭错误消息">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
             </transition>

            <!-- ADDED: Step 0: Entry Page -->
            <div id="step-entry" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 0">
                <!-- Header -->
                <div class="text-center mb-8">
                     <div class="w-24 h-24 rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <!-- You can use a relevant icon, e.g., trophy or calendar -->
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
                    <!-- Optional: Rules Link -->
                    <!--
                    <div v-if="state.eventInfo.rulesLink" class="flex items-start">
                         <img src="https://unpkg.com/lucide-static@latest/icons/book-open.svg" class="w-4 h-4 mr-3 text-purple-300 flex-shrink-0 mt-1" alt="Rules">
                        <a :href="state.eventInfo.rulesLink" target="_blank" rel="noopener noreferrer" class="text-purple-400 hover:underline font-medium">查看详细规则</a>
                    </div>
                     -->
                </div>

                <!-- Enter Button -->
                <!-- MODIFIED: Button goes to step 1 -->
                <button @click="showStep(1)" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300">
                    进入报名 / 组队
                </button>
            </div>

            <!-- MODIFIED: Step 1: Team Code Input (was Step 1) -->
            <div id="step-team-code" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 1">
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
                        @input="(event) => state.teamCode = event.target.value.replace(/[^0-9]/g, '')"
                        @keydown.enter="handleContinue"
                    >
                    <p class="mt-2 text-xs text-gray-400">不存在的组队码将自动创建新队伍</p>
                </div>

                <!-- Continue Button -->
                <button @click="handleContinue" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    继续
                </button>
                 <!-- MODIFIED: Back button goes to step 0 -->
                 <button type="button" @click="showStep(0)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回活动信息
                </button>
            </div>

            <!-- MODIFIED: Step 2: Color Selection (was Step 2) -->
            <div id="step-color-selection" class="glass rounded-3xl p-4 sm:p-6 md:p-8 fade-in" v-if="state.currentStep === 2">
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
                                v-if="member.maimai_id"
                                type="button"
                                @click="openEditModal(member.maimai_id)"
                                class="flex-shrink-0 ml-auto px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-xs font-medium text-white transition-colors"
                                aria-label="修改此报名信息"
                            >
                                修改
                            </button>
                        </div>
                    </div>
                </div>
                <!-- Navigation Buttons -->
                 <!-- MODIFIED: Button goes to step 3 -->
                 <button @click="showStep(3)" :disabled="!state.selectedColor" :class="{'opacity-50 cursor-not-allowed': !state.selectedColor}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <!-- MODIFIED: Back button goes to step 1 -->
                <button type="button" @click="showStep(1)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- MODIFIED: Step 3: Job Selection (was Step 3) -->
            <div id="step-job-selection" class="glass rounded-3xl p-4 sm:p-6 md:p-8 fade-in" v-if="state.currentStep === 3">
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
                         @click="selectJob('job-attacker');" @keydown.enter="selectJob('job-attacker')" @keydown.space="selectJob('job-attacker')">
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
                         <div v-else v-for="member in state.currentTeamMembers" :key="member.maimai_id || member.nickname" class="flex items-center">
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
                        </div>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                <!-- MODIFIED: Button goes to step 4 -->
                <button @click="showStep(4)" :disabled="!state.selectedJob" :class="{'opacity-50 cursor-not-allowed': !state.selectedJob}" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4">
                    下一步
                </button>
                <!-- MODIFIED: Back button goes to step 2 -->
                <button type="button" @click="showStep(2)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回
                </button>
            </div>

            <!-- MODIFIED: Step 4: Personal Info (was Step 4) -->
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
                        <input type="text" id="maimai-id" v-model="state.maimaiId" required placeholder="例如：Om1tted" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="13">
                         <p class="mt-1 text-xs text-gray-400">用于唯一识别你的报名信息，未来修改/删除时需提供</p>
                    </div>

                    <div class="mb-4">
                        <label for="nickname" class="block text-sm font-medium text-purple-300 mb-2">称呼 <span class="text-red-500">*</span></label>
                        <input type="text" id="nickname" v-model="state.nickname" required placeholder="例如：om1t" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="50">
                    </div>

                    <div class="mb-6">
                        <label for="qq-number" class="block text-sm font-medium text-purple-300 mb-2">QQ号 <span class="text-red-500">*</span></label>
                        <input type="text" inputmode="numeric" id="qq-number" v-model="state.qqNumber" required placeholder="例如：1234567890" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none" pattern="[1-9][0-9]{4,14}" maxlength="15">
                         <p class="mt-1 text-xs text-gray-400">用于验证你的身份，请务必准确填写。</p>
                    </div>

                    <!-- Privacy Agreement -->
                     <div class="mb-6">
                        <label class="flex items-start cursor-pointer">
                            <input type="checkbox" id="privacy-agree" v-model="state.privacyAgreed" required class="mt-1 mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-500 rounded bg-gray-700 outline-none">
                             <span class="text-xs text-gray-300 select-none">我已阅读并同意<a href="#" @click.prevent class="text-purple-400 hover:underline font-medium">隐私政策</a>，允许收集和使用我的QQ号用于组队联系、身份验证目的。<span class="text-red-500">*</span></span>
                        </label>
                    </div>

                    <!-- Action Buttons -->
                    <button type="submit" :disabled="!state.privacyAgreed || state.showLoadingOverlay" class="btn-glow w-full bg-purple-700 hover:bg-purple-600 rounded-lg py-3 font-bold transition duration-300 mb-4" :class="{'opacity-50 cursor-not-allowed': !state.privacyAgreed || state.showLoadingOverlay}">
                         {{ state.showLoadingOverlay ? '正在完成...' : '完成注册' }}
                    </button>

                    <!-- MODIFIED: Back button goes to step 3 -->
                    <button type="button" @click="showStep(3)" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                        返回
                    </button>
                </form>
            </div>

            <!-- MODIFIED: Step 5: Completion Page (was Step 5) -->
            <div id="step-completion" class="glass rounded-3xl p-8 fade-in" v-if="state.currentStep === 5">
                 <!-- Progress Bar (Completed) -->
                <div class="mb-8">
                    <div class="flex justify-between text-xs text-gray-400 mb-2 px-1">
                        <!-- MODIFIED: Highlight logic adjusted -->
                        <span class="text-white font-bold">组队码</span>
                        <span class="text-white font-bold">颜色</span>
                        <span class="text-white font-bold">职业</span>
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

                <!-- Final Member List -->
                <div class="glass rounded-xl p-4 mb-8 border border-gray-700">
                    <h3 class="text-sm font-medium mb-3 text-purple-300">队伍成员</h3>
                    <div class="space-y-3 max-h-48 overflow-y-auto">
                         <div v-if="state.completionAllMembers.length === 0" class="text-center text-gray-500 text-sm py-2">队伍信息加载中...</div>
                         <div v-else v-for="member in state.completionAllMembers" :key="member.maimai_id || member.maimaiId || (member.nickname + member.qqNumber)" class="flex items-center relative">
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
                                    <span v-if="(member.maimai_id || member.maimaiId) === state.maimaiId" class="ml-2 text-xs bg-purple-600 px-1.5 py-0.5 rounded text-white font-bold">你</span>
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
                         <button @click="openEditModal(state.maimaiId)" class="bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition duration-300 flex items-center mx-auto">
                             <img src="https://unpkg.com/lucide-static@latest/icons/file-pen.svg" class="w-4 h-4 mr-2" alt="Edit">
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
                             @click="copyShareLink"
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
                <!-- MODIFIED: Button goes to step 0 via goHome -->
                <button type="button" @click="goHome" class="w-full bg-transparent border border-gray-600 rounded-lg py-3 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                    返回首页
                </button>
            </div> <!-- End of Step 5 -->

             </div> <!-- End of relative z-10 block -->

            <!-- Footer Info -->
            <div class="text-center text-xs text-gray-500 mt-8 relative z-10">
                 <p>{{ new Date().getFullYear() }} © NGU Team © MPAM-Lab | <a :href="websiteLink" target="_blank" rel="noopener noreferrer" class="hover:text-purple-400">{{ websiteLink.replace(/^https?:\/\/(www\.)?/, '') }}</a></p>
            </div>

        </div> <!-- End of Container -->

        <!-- Modals -->
        <!-- Confirm Join Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showConfirmModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
                <h3 class="text-xl font-bold mb-4">确认加入队伍</h3>
                <p class="mb-6 text-sm text-gray-200">你即将加入 "<span class="text-purple-400 font-bold">{{ state.teamName }}</span>" 队伍。当前成员 <span class="font-bold">{{ state.currentTeamMembers.length }}</span>/3。</p>
                 <div v-if="state.currentTeamMembers.length > 0" class="mb-4 space-y-2 max-h-32 overflow-y-auto text-sm border-t border-b border-gray-700 py-2 px-1">
                     <span class="font-semibold text-purple-300 block mb-1">现有成员:</span>
                      <div v-for="member in state.currentTeamMembers" :key="member.maimai_id || (member.nickname + member.qqNumber)" class="flex items-center justify-between">
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

                         <button
                            v-if="member.maimai_id"
                             type="button"
                             @click="openEditModal(member.maimai_id)"
                             class="flex-shrink-0 ml-auto px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-xs font-medium text-white transition-colors"
                             aria-label="修改此报名信息"
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
                    <button type="button" @click="confirmJoinTeam" class="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium">
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
                    <input type="text" id="newTeamName" v-model="state.newTeamName" placeholder="例如：对不队" class="w-full form-input rounded-lg py-3 px-4 text-white focus:outline-none" maxlength="20" @keydown.enter="createNewTeam">
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

        <!-- Edit/Delete Member Modal -->
        <div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm overflow-y-auto" v-show="state.showEditModal">
            <div class="glass rounded-2xl p-6 max-w-sm w-full fade-in shadow-xl border border-gray-700 my-8">
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
                            <option value="red" :disabled="isColorDisabled('red')" :class="{'opacity-50': isColorDisabled('red')}">{{ getColorText('red') }}</option>
                            <option value="green" :disabled="isColorDisabled('green')" :class="{'opacity-50': isColorDisabled('green')}">{{ getColorText('green') }}</option>
                            <option value="blue" :disabled="isColorDisabled('blue')" :class="{'opacity-50': isColorDisabled('blue')}">{{ getColorText('blue') }}</option>
                        </select>
                    </div>

                    <div class="mb-4">
                        <label for="edit-job" class="block text-sm font-medium text-purple-300 mb-2">新职业</label>
                        <select id="edit-job" v-model="state.editNewJob" class="form-input w-full rounded-lg py-3 px-4 text-white focus:outline-none bg-gray-700 appearance-none">
                             <option value="">-- 留空不修改 --</option>
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
                    <button type="button" @click="deleteEntry" :disabled="state.showLoadingOverlay || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()" class="btn-glow bg-red-600 hover:bg-red-700 rounded-lg py-3 px-6 font-bold transition duration-300 text-sm" :class="{'opacity-50 cursor-not-allowed': state.showLoadingOverlay || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()}">
                         删除我的报名信息
                    </button>
                 </div>
                <hr class="my-6 border-gray-700">

                <!-- Error message within modal -->
                <transition name="fade-in-up">
                <div v-if="state.errorMessage && state.showEditModal" class="bg-red-600 bg-opacity-90 text-white text-sm p-3 rounded-lg mb-6 shadow-lg flex items-start" role="alert">
                    <img src="https://unpkg.com/lucide-static@latest/icons/circle-alert.svg" class="w-5 h-5 mr-3 text-yellow-300 flex-shrink-0 mt-0.5" alt="Error">
                    <span class="break-words flex-grow">{{ state.errorMessage }}</span>
                 </div>
                </transition>

                <!-- Action Buttons -->
                 <div class="flex space-x-4 justify-center">
                     <button type="button" @click="closeEditModal" class="flex-1 py-3 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition text-sm font-medium max-w-[100px]">
                         取消
                     </button>
                    <button type="button" @click="saveChanges" :disabled="state.showLoadingOverlay || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()" class="flex-1 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 transition btn-glow text-sm font-medium max-w-[180px]" :class="{'opacity-50 cursor-not-allowed': state.showLoadingOverlay || !state.editAuthMaimaiId?.trim() || !state.editAuthQqNumber?.trim()}">
                         {{ state.showLoadingOverlay ? '保存中...' : '保存更改' }}
                    </button>
                 </div>

            </div>
        </div>

        <!-- Loading Overlay -->
        <div class="loading-overlay z-40" v-show="state.showLoadingOverlay">
            <div class="spinner"></div>
            <p class="mt-4 text-white">
                 {{ state.errorMessage ? state.errorMessage : '处理中，请稍候...' }}
            </p>
        </div>

         <!-- Celebration Container -->
        <div class="celebration z-0" id="celebration"></div>
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