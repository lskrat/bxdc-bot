<script setup lang="ts">
const globalConfig = {
  locale: {
    empty: { titleText: { empty: '' } },
    autoComplete: { empty: '' },
    cascader: { empty: '' },
    transfer: { empty: '' },
    table: { empty: '' },
    select: { empty: '' },
    tree: { empty: '' },
    treeSelect: { empty: '' },
  },
}
</script>

<template>
  <t-config-provider :global-config="globalConfig">
    <router-view />
  </t-config-provider>
</template>

<style>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
