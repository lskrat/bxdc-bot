<script setup lang="ts">
import { useSkillHub, BUILT_IN_SKILLS } from '../composables/useSkillHub';
import { AppIcon, CalculatorIcon, ExtensionIcon } from 'tdesign-icons-vue-next';

const { isSkillHubVisible, skills, isLoading, error, closeSkillHub } = useSkillHub();
</script>

<template>
  <t-drawer
    v-model:visible="isSkillHubVisible"
    header="Skill Hub"
    size="medium"
    :footer="false"
    @close="closeSkillHub"
  >
    <div class="skill-hub-content">
      <div class="section">
        <h3 class="section-title">Built-in Skills</h3>
        <t-list :split="true">
          <t-list-item v-for="skill in BUILT_IN_SKILLS" :key="skill.id">
            <template #action>
              <t-tag theme="primary" variant="light">Built-in</t-tag>
            </template>
            <t-list-item-meta :title="skill.name" :description="skill.description">
              <template #image>
                <div class="skill-icon builtin">
                  <AppIcon v-if="skill.name.includes('API')" />
                  <CalculatorIcon v-else-if="skill.name.includes('Compute')" />
                  <ExtensionIcon v-else />
                </div>
              </template>
            </t-list-item-meta>
          </t-list-item>
        </t-list>
      </div>

      <div class="section">
        <h3 class="section-title">Extended Skills</h3>
        <div v-if="isLoading" class="loading-state">
          <t-loading text="Loading skills..." />
        </div>
        <div v-else-if="error" class="error-state">
          <t-alert theme="error" :message="error" />
        </div>
        <div v-else-if="skills.length === 0" class="empty-state">
          <p>No extended skills found.</p>
        </div>
        <t-list v-else :split="true">
          <t-list-item v-for="skill in skills" :key="skill.id">
            <template #action>
              <t-tag theme="success" variant="light">Extended</t-tag>
            </template>
            <t-list-item-meta :title="skill.name" :description="skill.description || 'No description provided.'">
              <template #image>
                <div class="skill-icon extended">
                  <ExtensionIcon />
                </div>
              </template>
            </t-list-item-meta>
          </t-list-item>
        </t-list>
      </div>
    </div>
  </t-drawer>
</template>

<style scoped>
.skill-hub-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--td-text-color-primary);
}

.skill-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.skill-icon.builtin {
  background-color: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.skill-icon.extended {
  background-color: var(--td-success-color-light);
  color: var(--td-success-color);
}

.loading-state,
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--td-text-color-secondary);
}
</style>
