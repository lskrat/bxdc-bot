import { ref } from 'vue';
import { useUser } from './useUser';

export interface ServerLedger {
  id?: number;
  ip: string;
  username: string;
  password?: string;
  createdAt?: string;
  updatedAt?: string;
}

const isServerLedgerVisible = ref(false);
const ledgers = ref<ServerLedger[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

export function useServerLedger() {
  const { currentUser } = useUser();

  function toggleServerLedger() {
    isServerLedgerVisible.value = !isServerLedgerVisible.value;
    if (isServerLedgerVisible.value) {
      fetchLedgers();
    }
  }

  async function fetchLedgers() {
    if (!currentUser.value) return;
    isLoading.value = true;
    error.value = null;
    try {
      const res = await fetch('http://localhost:18080/api/server-ledgers', {
        headers: {
          'X-User-Id': currentUser.value.id
        }
      });
      if (!res.ok) throw new Error('Failed to fetch server ledgers');
      ledgers.value = await res.json();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  async function createLedger(ledger: ServerLedger) {
    if (!currentUser.value) return;
    try {
      const res = await fetch('http://localhost:18080/api/server-ledgers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.value.id
        },
        body: JSON.stringify(ledger)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create ledger');
      }
      await fetchLedgers();
    } catch (e) {
      throw e;
    }
  }

  async function updateLedger(id: number, ledger: ServerLedger) {
    if (!currentUser.value) return;
    try {
      const res = await fetch(`http://localhost:18080/api/server-ledgers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUser.value.id
        },
        body: JSON.stringify(ledger)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update ledger');
      }
      await fetchLedgers();
    } catch (e) {
      throw e;
    }
  }

  async function deleteLedger(id: number) {
    if (!currentUser.value) return;
    try {
      const res = await fetch(`http://localhost:18080/api/server-ledgers/${id}`, {
        method: 'DELETE',
        headers: {
          'X-User-Id': currentUser.value.id
        }
      });
      if (!res.ok) throw new Error('Failed to delete ledger');
      await fetchLedgers();
    } catch (e) {
      throw e;
    }
  }

  return {
    isServerLedgerVisible,
    ledgers,
    isLoading,
    error,
    toggleServerLedger,
    fetchLedgers,
    createLedger,
    updateLedger,
    deleteLedger
  };
}
