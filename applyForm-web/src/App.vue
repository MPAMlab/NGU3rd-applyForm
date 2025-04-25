<template>
  <!--
    <router-view> 是 Vue Router 的核心组件。
    它会根据当前的路由路径，渲染匹配到的组件。
    在我们的应用中，根路径 '/' 匹配到的是 Index.vue 组件，
    所以 App.vue 会在这里渲染 Index.vue。
  -->
  <router-view />
</template>

<script setup>
// 在这个简单的 SPA 结构中，App.vue 不需要特别的逻辑。
// 所有的步骤管理和数据流都在 Index.vue 中处理。
</script>

<style>
/*
  全局样式块。
  我们可以在这里设置整个应用的通用样式，例如 body 的背景、字体等。
  使用 @apply 指令来应用 Tailwind CSS 类。
*/
body {
  /* 设置一个深色的背景，浅色的文字，使用无衬线字体 */
  @apply bg-gray-900 text-gray-100 font-sans;
  margin: 0; /* 移除浏览器默认的 body 外边距 */
  padding: 0; /* 移除浏览器默认的 body 内边距 */
  /* 确保 body 至少占满整个视口高度，有助于居中或底部对齐布局 */
  min-height: 100vh;
  /* 可选：如果 Index.vue 的内容不是全屏的，可以在这里尝试居中 */
  display: flex;
  justify-content: center;
  align-items: center;
  /* 防止滚动条出现在 App.vue 层面，滚动应该由内部组件控制 */
  overflow: hidden;
}

/*
  注意：确保你的主 CSS 文件 (例如 src/index.css 或 src/main.js/main.ts)
  已经正确导入了 Tailwind CSS 的 base, components, 和 utilities 指令。
  例如在一个 index.css 文件中：
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  然后在 main.js/main.ts 中导入这个 index.css 文件。
*/

/* 你可以在这里添加其他任何你需要的全局样式 */
</style>