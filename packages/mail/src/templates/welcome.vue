<script setup lang="ts">
const { name = 'friend' } = defineConfig({});
</script>

<template>
  <Html>
    <Head />
    <Body>
      <Tailwind>
        <Container class="bg-gray-100 p-6">
          <Text class="text-lg text-gray-800">Welcome, {{ name }}.</Text>
          <Text class="text-sm text-gray-700">Thanks for joining SaaS App.</Text>
        </Container>
      </Tailwind>
    </Body>
  </Html>
</template>
