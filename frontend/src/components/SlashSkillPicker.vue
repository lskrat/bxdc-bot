<!--
  open spec: add-slash-skill-invocation
  内联 skill picker：当 MessageInput 输入框以 / 或 # 开头时显示，跟随输入框下方。
  显示当前 trigger 字符 + 当前 query + 过滤后的技能列表。
  选中后 emit select(skill) → MessageInput 重写 input.value = `<trigger>${name} `。
  关闭：emit close() 或 v-if=false。
-->
<template>
  <div v-if="visible" class="slash-skill-picker">
    <div class="slash-skill-picker-header">
      <span class="slash-skill-picker-trigger">{{ trigger }}</span>
      <span class="slash-skill-picker-query">{{ query || '选择技能...' }}</span>
      <span class="slash-skill-picker-count">{{ filteredSkills.length }} 个</span>
    </div>
    <div v-if="filteredSkills.length === 0" class="slash-skill-picker-empty">
      没有匹配的技能
    </div>
    <ul v-else class="slash-skill-picker-list">
      <li
        v-for="(skill, idx) in filteredSkills"
        :key="skill.id"
        class="slash-skill-picker-item"
        :class="{ 'is-active': idx === activeIndex }"
        @mousedown.prevent="onPick(skill)"
        @mouseenter="activeIndex = idx"
      >
        <span class="slash-skill-picker-item-icon">⚡</span>
        <span class="slash-skill-picker-item-name">{{ skill.name }}</span>
        <span class="slash-skill-picker-item-id">#{{ skill.id }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConversationEnabledSkill } from '../services/api'

const props = defineProps<{
  visible: boolean
  trigger: '/' | '#'
  query: string
  skills: ConversationEnabledSkill[]
}>()

const emit = defineEmits<{
  (e: 'select', skill: ConversationEnabledSkill): void
  (e: 'close'): void
}>()

const activeIndex = ref(0)

const filteredSkills = computed(() => {
  const q = props.query.trim().toLowerCase()
  if (!q) return props.skills
  return props.skills.filter(
    (s) => s.name.toLowerCase().includes(q) || String(s.id).includes(q),
  )
})

watch(
  () => props.query,
  () => {
    activeIndex.value = 0
  },
)

function onPick(skill: ConversationEnabledSkill) {
  emit('select', skill)
}

// 暴露给父组件：键盘上下选择 + Enter 确认 + Esc 关闭。
defineExpose({
  moveUp() {
    if (filteredSkills.value.length === 0) return
    activeIndex.value = (activeIndex.value - 1 + filteredSkills.value.length) % filteredSkills.value.length
  },
  moveDown() {
    if (filteredSkills.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % filteredSkills.value.length
  },
  pickActive() {
    const skill = filteredSkills.value[activeIndex.value]
    if (skill) onPick(skill)
  },
  close() {
    emit('close')
  },
})
</script>

<style scoped>
.slash-skill-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 8px;
  background-color: var(--td-bg-color-container, #fff);
  border: 1px solid var(--td-border-level-2-color, #e7e7e7);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  max-height: 320px;
  overflow-y: auto;
}

.slash-skill-picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--td-border-level-2-color, #e7e7e7);
  font-size: 12px;
  color: var(--td-text-color-secondary, #666);
}

.slash-skill-picker-trigger {
  display: inline-block;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background-color: var(--td-brand-color-light, rgba(0, 96, 175, 0.1));
  color: var(--td-brand-color, #0052d9);
  font-weight: 600;
  text-align: center;
}

.slash-skill-picker-query {
  flex: 1;
  font-family: monospace;
  color: var(--td-text-color-primary, #333);
}

.slash-skill-picker-count {
  color: var(--td-text-color-placeholder, #999);
}

.slash-skill-picker-empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--td-text-color-placeholder, #999);
  font-size: 13px;
}

.slash-skill-picker-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.slash-skill-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.1s;
}

.slash-skill-picker-item:hover,
.slash-skill-picker-item.is-active {
  background-color: var(--td-bg-color-secondarycontainer, #f3f3f3);
}

.slash-skill-picker-item-icon {
  font-size: 14px;
  color: var(--td-brand-color, #0052d9);
}

.slash-skill-picker-item-name {
  flex: 1;
  color: var(--td-text-color-primary, #333);
}

.slash-skill-picker-item-id {
  color: var(--td-text-color-placeholder, #999);
  font-size: 12px;
  font-family: monospace;
}
</style>