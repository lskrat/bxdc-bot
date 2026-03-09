<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  avatar?: string;
  size?: number;
}>();

const displayAvatar = computed(() => props.avatar || '👤');
const sizeStyle = computed(() => ({
  fontSize: `${props.size || 24}px`,
  lineHeight: `${props.size || 24}px`,
  width: `${props.size || 24}px`,
  height: `${props.size || 24}px`,
}));
</script>

<template>
  <div class="user-avatar" :style="sizeStyle">{{ displayAvatar }}</div>
</template>

<style scoped>
.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  background: #f0f0f0;
  border-radius: 50%;
}
</style>
