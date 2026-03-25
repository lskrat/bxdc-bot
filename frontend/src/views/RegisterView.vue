<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUser } from '../composables/useUser';
import Button from '../components/ui/Button.vue';
import Input from '../components/ui/Input.vue';
import Card from '../components/ui/Card.vue';
import { agentUrl } from '../services/config';

const userId = ref('');
const nickname = ref('');
const error = ref('');
const loading = ref(false);
const { register, updateAvatar } = useUser();
const router = useRouter();

const step = ref<'form' | 'generating' | 'complete'>('form');
const generatedAvatar = ref('');

async function handleRegister() {
  error.value = '';
  loading.value = true;
  try {
    // 1. Register (without redirect)
    // @ts-ignore - register returns user now
    const user = await register(userId.value, nickname.value, false);
    
    if (!user) {
        throw new Error('注册失败');
    }

    // 2. Generating step
    step.value = 'generating';
    loading.value = false;

    // 3. Call Node.js Avatar Service
    try {
        const res = await fetch(agentUrl('/features/avatar/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: nickname.value })
        });
        const data = await res.json();
        const avatar = data.avatar || '👤';
        generatedAvatar.value = avatar;

        // 4. Update avatar in backend
        await updateAvatar(user.id, avatar);
        
        // Wait a bit to show the avatar
        setTimeout(() => {
            step.value = 'complete';
        }, 1000);
        
    } catch (e) {
        console.error("Avatar generation failed:", e);
        generatedAvatar.value = '👤';
        step.value = 'complete';
    }

  } catch (e: any) {
    loading.value = false;
    error.value = e.message || '注册失败';
  }
}

function goToChat() {
    router.push('/');
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50 p-4">
    <!-- Step 1: Registration Form -->
    <Card v-if="step === 'form'" class="w-full max-w-md shadow-lg border-0" title="创建账户" description="创建新账户以加入我们">
      <form @submit.prevent="handleRegister" class="space-y-6">
        <Input
          v-model="userId"
          label="用户 ID"
          placeholder="6 位数字 (例如 123456)"
          :error="error && error.includes('ID') ? error : undefined"
          :disabled="loading"
        />
        
        <Input
          v-model="nickname"
          label="昵称"
          placeholder="我们该如何称呼您？"
          :disabled="loading"
        />

        <div v-if="error && !error.includes('ID')" class="text-sm font-medium text-red-500">
          {{ error }}
        </div>

        <div class="pt-2">
          <Button type="submit" class="w-full" variant="primary" :loading="loading">
            开始使用
          </Button>
        </div>

        <div class="text-center text-sm text-slate-500">
          已有账户？
          <router-link to="/login" class="font-medium text-blue-600 hover:text-blue-500 hover:underline">
            登录
          </router-link>
        </div>
      </form>
    </Card>

    <!-- Step 2: Generating Avatar -->
    <Card v-else-if="step === 'generating'" class="w-full max-w-md shadow-lg border-0 text-center py-10">
      <div class="flex flex-col items-center justify-center space-y-6">
        <div class="relative w-24 h-24">
           <div class="absolute inset-0 rounded-full border-4 border-blue-100 animate-pulse"></div>
           <div class="absolute inset-0 rounded-full border-t-4 border-blue-600 animate-spin"></div>
           <div class="absolute inset-0 flex items-center justify-center text-4xl animate-pulse">
             👤
           </div>
        </div>
        <div>
            <h3 class="text-xl font-medium text-slate-900 mb-2">正在创建您的角色</h3>
            <p class="text-slate-500">我们正在让 AI 为 <strong>{{ nickname }}</strong> 挑选完美的头像...</p>
        </div>
      </div>
    </Card>

    <!-- Step 3: Complete -->
    <Card v-else-if="step === 'complete'" class="w-full max-w-md shadow-lg border-0 text-center py-10" title="准备就绪！">
       <div class="flex flex-col items-center justify-center space-y-6">
        <div class="w-32 h-32 rounded-full bg-blue-50 flex items-center justify-center text-6xl shadow-inner transform transition-transform hover:scale-110 duration-300">
           {{ generatedAvatar }}
        </div>
        <div class="space-y-2">
          <h3 class="text-xl font-medium text-slate-900">欢迎，{{ nickname }}！</h3>
          <p class="text-slate-500">您的 AI 伙伴正在等待。</p>
        </div>
        <div class="w-full pt-4">
           <Button @click="goToChat" class="w-full" variant="primary" size="lg">开始聊天</Button>
        </div>
       </div>
    </Card>
  </div>
</template>
