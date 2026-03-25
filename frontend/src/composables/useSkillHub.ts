import { ref } from 'vue';
import { apiUrl } from '../services/config';

export interface Skill {
  id: number;
  name: string;
  description: string;
  type: string;
  configuration: string;
  enabled: boolean;
}

const isSkillHubVisible = ref(false);
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

  return {
    isSkillHubVisible,
    skills,
    isLoading,
    error,
    toggleSkillHub,
    openSkillHub,
    closeSkillHub,
    fetchSkills,
  };
}
