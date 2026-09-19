<script setup lang="ts">
const head = useLocaleHead();
</script>

<template>
  <Html :lang="head.htmlAttrs.lang" :dir="head.htmlAttrs.dir">
    <Head>
      <Title>RAGNA Studio</Title>
    </Head>

    <Body class="bg-background">
      <div class="h-screen lg:grid lg:grid-cols-2">
        <slot />
      </div>
    </Body>
  </Html>
</template>
