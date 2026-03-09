import type {
  EmailConnectivityTestResult,
  Skill,
} from './types';

declare global {
  interface Window {
    electron: {
      skills: {
        list: () => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
        setEnabled: (options: { id: string; enabled: boolean }) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
        delete: (id: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
        download: (source: string) => Promise<{ success: boolean; skills?: Skill[]; error?: string }>;
        getRoot: () => Promise<{ success: boolean; path?: string; error?: string }>;
        autoRoutingPrompt: () => Promise<{ success: boolean; prompt?: string | null; error?: string }>;
        getConfig: (skillId: string) => Promise<{ success: boolean; config?: Record<string, string>; error?: string }>;
        setConfig: (skillId: string, config: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
        testEmailConnectivity: (
          skillId: string,
          config: Record<string, string>
        ) => Promise<{ success: boolean; result?: EmailConnectivityTestResult; error?: string }>;
        onChanged: (callback: () => void) => () => void;
      };
      dialog: {
        selectFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
          Promise<{ success: boolean; canceled?: boolean; path?: string; paths?: string[]; error?: string }>;
        selectDirectory: () => Promise<{ success: boolean; canceled?: boolean; path?: string; error?: string }>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
    };
  }
}

export {};
