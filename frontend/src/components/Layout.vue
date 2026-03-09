<script setup lang="ts">
import { useUser } from '../composables/useUser';
import UserAvatar from './UserAvatar.vue';

const { currentUser, logout } = useUser();
</script>

<template>
  <t-layout class="app-layout">
    <t-header class="layout-header">
      <div class="layout-header__content">
        <div class="layout-brand">
          <div class="layout-title">BXDC.bot</div>
          <div class="layout-subtitle">AI Chat</div>
        </div>
        
        <div style="flex: 1"></div>

        <div class="layout-actions" v-if="currentUser">
          <div class="user-info">
            <UserAvatar :avatar="currentUser.avatar" :size="32" />
            <span class="user-name">{{ currentUser.nickname }}</span>
          </div>
          <t-button theme="default" variant="text" @click="logout">Switch User</t-button>
        </div>
      </div>
    </t-header>
    <t-content class="layout-content">
      <div class="layout-content-inner">
        <slot />
      </div>
    </t-content>
  </t-layout>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  background-color: var(--td-bg-color-page);
}

.layout-header {
  background: transparent;
  padding: 16px 16px 12px;
}

.layout-header__content {
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  align-items: center;
}

@media (min-width: 768px) {
  .layout-header {
    padding: 24px 24px 12px;
  }
}

.layout-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.layout-subtitle {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.layout-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
}

.layout-content {
  flex: 1;
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
}

.layout-content-inner {
  flex: 1;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .layout-content {
    padding: 0 24px 24px;
  }
}
</style>
