<script setup lang="ts">
interface Props {
  title?: string
  description?: string
}

defineProps<Props>()
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm">
    <div v-if="title || description" class="flex flex-col space-y-1.5 p-6">
      <h3 v-if="title" class="text-2xl font-semibold leading-none tracking-tight">
        {{ title }}
      </h3>
      <p v-if="description" class="text-sm text-slate-500">
        {{ description }}
      </p>
    </div>
    <div class="p-6 pt-0">
      <slot />
    </div>
    <div v-if="$slots.footer" class="flex items-center p-6 pt-0">
      <slot name="footer" />
    </div>
  </div>
</template>
