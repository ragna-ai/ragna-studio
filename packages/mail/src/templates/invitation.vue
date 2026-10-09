<script setup lang="ts">
const { inviterName = 'Someone', organizationName = 'a team', url = '' } = defineConfig({});
</script>

<template>
  <Html>
    <Head />
    <Body>
      <Tailwind>
        <Container class="bg-gray-100 p-6">
          <Text class="text-lg text-gray-800">
            {{ inviterName }} invited you to join {{ organizationName }}.
          </Text>
          <Text class="text-sm text-gray-700"> Sign in with this email address to join: </Text>
          <Button :href="url"> Join {{ organizationName }} </Button>
        </Container>
      </Tailwind>
    </Body>
  </Html>
</template>
