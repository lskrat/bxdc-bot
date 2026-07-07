import { ref } from 'vue';

// open spec: convert-llm-settings-to-modal
// 模块级 singleton ref + toggle 函数，对齐 useServerLedger / useSkillHub 模式。
// 由 Layout.vue 顶栏按钮调用，弹窗组件读 isLlmSettingsVisible 决定显示。
const isLlmSettingsVisible = ref(false);

export function useLlmSettings() {
  function toggleLlmSettings() {
    isLlmSettingsVisible.value = !isLlmSettingsVisible.value
  }

  function openLlmSettings() {
    isLlmSettingsVisible.value = true
  }

  function closeLlmSettings() {
    isLlmSettingsVisible.value = false
  }

  return {
    isLlmSettingsVisible,
    toggleLlmSettings,
    openLlmSettings,
    closeLlmSettings,
  }
}