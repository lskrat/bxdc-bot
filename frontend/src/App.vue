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
html, body {
  height: 100%;
  margin: 0;
  overflow: hidden;
}

#app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#app > * {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
