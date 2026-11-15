<script setup lang="ts">
const { locale = 'de', preheader = '', heading = '', paragraphs = [], action } = defineConfig({});
</script>

<template>
  <Html :lang="locale">
    <Head />
    <Body>
      <Preheader>{{ preheader }}</Preheader>
      <Tailwind>
        <Container class="bg-gray-100 p-6">
          <Text class="text-lg text-gray-800">{{ heading }}</Text>
          <Text v-for="(paragraph, index) in paragraphs" :key="index" class="text-sm text-gray-700">
            {{ paragraph }}
          </Text>
          <Button v-if="action" :href="action.url">{{ action.label }}</Button>
        </Container>
      </Tailwind>
    </Body>
  </Html>
</template>
