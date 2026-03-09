import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

export interface User {
  id: string;
  nickname: string;
  avatar: string;
}

// Global state
const currentUser = ref<User | null>(null);
const token = ref<string | null>(localStorage.getItem('user_id'));

export function useUser() {
  const router = useRouter();

  const isLoggedIn = computed(() => !!currentUser.value);

  async function login(id: string) {
    try {
      const res = await fetch('http://localhost:18080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Login failed' }));
          throw new Error(error.error || 'Login failed');
      }
      
      const user = await res.json();
      currentUser.value = user;
      token.value = user.id;
      localStorage.setItem('user_id', user.id);
      router.push('/');
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async function register(id: string, nickname: string, redirect = true) {
    try {
      const res = await fetch('http://localhost:18080/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nickname })
      });

      if (!res.ok) {
          const error = await res.json().catch(() => ({ error: 'Registration failed' }));
          throw new Error(error.error || 'Registration failed');
      }

      const user = await res.json();
      currentUser.value = user;
      token.value = user.id;
      localStorage.setItem('user_id', user.id);
      
      if (redirect) {
        router.push('/');
      }
      return user;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  function logout() {
    currentUser.value = null;
    token.value = null;
    localStorage.removeItem('user_id');
    router.push('/login');
  }

  async function restoreSession() {
    if (!token.value) return;
    try {
      const res = await fetch(`http://localhost:18080/api/user/${token.value}`);
      if (res.ok) {
        currentUser.value = await res.json();
      } else {
        // If user not found (e.g. wiped DB), clear local storage
        logout();
      }
    } catch (e) {
      console.error('Failed to restore session:', e);
      // Don't logout immediately on network error, but user remains null so UI might show loading or login prompt
    }
  }

  async function updateAvatar(id: string, avatar: string) {
    try {
        const res = await fetch(`http://localhost:18080/api/user/${id}/avatar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatar })
        });
        if (res.ok) {
            const user = await res.json();
            currentUser.value = user;
            return user;
        }
    } catch (e) {
        console.error('Failed to update avatar:', e);
    }
  }

  return {
    currentUser,
    isLoggedIn,
    login,
    register,
    logout,
    restoreSession,
    updateAvatar
  };
}
