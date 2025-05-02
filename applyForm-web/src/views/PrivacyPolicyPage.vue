<!-- views/PrivacyPolicyPage.vue -->
<script setup lang="ts">
// No specific script logic needed for a static page
</script>

<template>
    <!-- Root container, similar background and padding to index -->
    <div class="bg-gray-900 text-white min-h-screen flex flex-col items-center px-4 py-8 sm:px-6 lg:px-8 relative">

        <!-- Optional: Background triangles if you want them here too -->
        <!-- <div id="triangles" class="absolute inset-0 z-0 overflow-hidden"></div> -->

        <!-- Main Content Container - Wider than the form, centered -->
        <div class="w-full max-w-3xl mx-auto relative z-10 py-8">

            <h1 class="text-3xl font-bold mb-6 text-center text-purple-300">隐私政策</h1>

            <div class="glass rounded-2xl p-6 shadow-xl border border-gray-700">

                <p class="mb-4 text-gray-300 leading-relaxed">
                    本隐私政策描述了 NGU 3rd（以下简称“我们”）如何收集、使用和保护您在使用 NGU 3rd 服务时提供的个人信息。
                </p>

                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">我们收集的信息</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    在使用我们的服务时，我们可能会收集以下信息：
                </p>
                <ul class="list-disc list-inside mb-4 text-gray-300 leading-relaxed space-y-2">
                    <li>通过 Kinde 认证服务收集的信息：您的 Kinde 用户 ID、电子邮件地址、姓名。</li>
                    <li>您在使用我们服务过程中主动提供的信息：舞萌 ID、称呼、QQ 号码、选择的队伍码、元素、职业、上传的头像图片。</li>
                    <li>系统自动收集的信息：访问日志、IP 地址、设备信息等（用于网站运行维护和安全分析）。</li>
                </ul>

                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">信息的使用</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    我们收集您的信息主要用于以下目的：
                </p>
                 <ul class="list-disc list-inside mb-4 text-gray-300 leading-relaxed space-y-2">
                    <li>处理您的赛事报名和组队信息。</li>
                    <li>在队伍内部展示您的称呼、舞萌 ID、元素、职业和头像，以便队友识别。</li>
                    <li>使用您的 QQ 号码进行必要的赛事通知、组队协调或紧急联系。</li>
                    <li>维护和改进网站服务，确保网站安全稳定运行。</li>
                    <li>在您同意的情况下，用于其他与赛事相关的沟通。</li>
                </ul>
                 <p class="mb-4 text-gray-300 leading-relaxed">
                     我们不会将您的个人信息出售给第三方。除以下情况外，我们不会与任何第三方共享您的个人信息：
                 </p>
                 <ul class="list-disc list-inside mb-4 text-gray-300 leading-relaxed space-y-2">
                     <li>经过您的明确同意。</li>
                     <li>为了完成您请求的服务（例如，与 Kinde 共享必要信息进行认证）。</li>
                     <li>根据法律法规的要求或政府部门的合法请求。</li>
                     <li>为保护我们、其他用户或公众的权利、财产或安全。</li>
                 </ul>


                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">信息安全</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    我们采取合理的物理、技术和管理措施来保护您的个人信息，防止未经授权的访问、披露、使用、修改、损坏或丢失。例如，我们使用加密技术保护数据传输，并限制对个人信息的访问。
                </p>
                 <p class="mb-4 text-gray-300 leading-relaxed">
                     尽管我们努力保护您的信息，但请注意，互联网上的数据传输并非完全安全。您也应采取措施保护您的个人信息，例如不共享您的账号密码。
                 </p>

                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">用户权利</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    根据适用的法律法规，您可能对您的个人信息享有以下权利：
                </p>
                 <ul class="list-disc list-inside mb-4 text-gray-300 leading-relaxed space-y-2">
                    <li>访问您的个人信息。</li>
                    <li>更正不准确的个人信息（您可以在报名网站上修改您的称呼、QQ号、元素、职业和头像）。</li>
                    <li>删除您的个人信息（您可以在报名网站上删除您的报名信息）。</li>
                    <li>撤回您的同意。</li>
                    <li>对个人信息处理提出异议。</li>
                </ul>
                 <p class="mb-4 text-gray-300 leading-relaxed">
                     如需行使您的权利，请通过本政策末尾提供的联系方式与我们联系。
                 </p>


                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">政策更新</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    我们可能会不时更新本隐私政策。任何更新将在本页面发布，并注明生效日期。建议您定期查看本政策以了解最新信息。
                </p>

                <h2 class="text-xl font-semibold mt-6 mb-3 text-purple-400">联系我们</h2>
                <p class="mb-4 text-gray-300 leading-relaxed">
                    如果您对本隐私政策有任何疑问或需要行使您的用户权利，请通过以下方式与我们联系：
                </p>
                 <ul class="list-disc list-inside mb-4 text-gray-300 leading-relaxed space-y-2">
                     <li>电子邮件：i@MPAM-lab.xyz</li>
                 </ul>

            </div>

             <!-- Back Button -->
             <div class="mt-8 text-center">
                 <router-link to="/" class="w-full inline-block bg-transparent border border-gray-600 rounded-lg py-3 px-6 font-medium transition duration-300 hover:bg-gray-700 text-gray-300">
                     返回首页
                 </router-link>
             </div>


        </div> <!-- End of Main Content Container -->

        <!-- Footer Info (Optional, can be a global component) -->
        <div class="text-center text-xs text-gray-500 mt-8 relative z-10">
             <p>{{ new Date().getFullYear() }} © NGU Team © MPAM-Lab | <a href="/" class="hover:text-purple-400">返回首页</a></p>
        </div>

    </div> <!-- End of Root container -->
</template>

<style scoped>
/* Add any specific styles here if needed, but Tailwind should cover most */

/* Re-use glass effect style */
.glass {
    background-color: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Optional: Style for list items if needed */
/* ul li { margin-bottom: 0.5rem; } */

</style>
