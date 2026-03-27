import { ref } from 'vue';
import { agentUrl, apiUrl } from '../services/config';

export interface Skill {
  id: number;
  name: string;
  description: string;
  type: string;
  executionMode?: 'CONFIG' | 'OPENCLAW';
  configuration: string;
  enabled: boolean;
  requiresConfirmation?: boolean;
}

export function getExecutionModeLabel(executionMode?: string): string {
  return executionMode === 'OPENCLAW' ? '自主规划' : '预配置'
}

const isSkillHubVisible = ref(false);
const isSkillManagementVisible = ref(false);
const skills = ref<Skill[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

export const BUILT_IN_SKILLS = [
  {
    id: -1,
    name: 'Interface calls (API)',
    description: 'Call external APIs to retrieve information or perform actions.',
    type: 'BUILTIN',
    configuration: '{}',
    enabled: true,
  },
  {
    id: -2,
    name: 'Calculation (Compute)',
    description: 'Perform mathematical calculations and data processing.',
    type: 'BUILTIN',
    configuration: '{}',
    enabled: true,
  },
  {
    id: -3,
    name: 'SSH Execution (Linux Script)',
    description: 'Execute shell commands on a preconfigured Linux server with serverId and command.',
    type: 'BUILTIN',
    configuration: '{}',
    enabled: true,
  },
  {
    id: -4,
    name: 'Skill Generator',
    description: 'Automatically generate and register new API, SSH, or OPENCLAW skills based on natural language descriptions.',
    type: 'BUILTIN',
    configuration: '{}',
    enabled: true,
  },
];

export function useSkillHub() {
  function toggleSkillHub() {
    isSkillHubVisible.value = !isSkillHubVisible.value;
    if (isSkillHubVisible.value && skills.value.length === 0) {
      fetchSkills();
    }
  }

  function openSkillHub() {
    isSkillHubVisible.value = true;
    if (skills.value.length === 0) {
      fetchSkills();
    }
  }

  function closeSkillHub() {
    isSkillHubVisible.value = false;
  }

  function openSkillManagement() {
    isSkillManagementVisible.value = true;
    fetchSkills();
  }

  function closeSkillManagement() {
    isSkillManagementVisible.value = false;
  }

  async function fetchSkills() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await fetch(apiUrl('/api/skills'));
      if (!res.ok) {
        throw new Error('Failed to fetch skills');
      }
      skills.value = await res.json();
    } catch (e) {
      console.error(e);
      error.value = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  async function createSkill(payload: Omit<Skill, 'id'>) {
    const res = await fetch(agentUrl('/features/skills'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create skill');
    }
    await fetchSkills();
  }

  async function updateSkill(id: number, payload: Omit<Skill, 'id'>) {
    const res = await fetch(agentUrl(`/features/skills/${id}`), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update skill');
    }
    await fetchSkills();
  }

  async function deleteSkill(id: number) {
    const res = await fetch(agentUrl(`/features/skills/${id}`), {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('Failed to delete skill');
    }
    await fetchSkills();
  }

  async function toggleSkillEnabled(skill: Skill, enabled: boolean) {
    await updateSkill(skill.id, {
      name: skill.name,
      description: skill.description,
      type: skill.type,
      executionMode: skill.executionMode ?? 'CONFIG',
      configuration: skill.configuration,
      enabled,
      requiresConfirmation: skill.requiresConfirmation ?? false,
    });
  }

  return {
    isSkillHubVisible,
    isSkillManagementVisible,
    skills,
    isLoading,
    error,
    toggleSkillHub,
    openSkillHub,
    closeSkillHub,
    openSkillManagement,
    closeSkillManagement,
    fetchSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleSkillEnabled,
  };
}
