<script setup lang="ts">
const { userName = 'there', passkeyName = 'a passkey', settingsUrl = '' } = defineConfig({});
</script>

<template>
  <Html>
    <Head />
    <Body>
      <Tailwind>
        <Container class="bg-gray-100 p-6">
          <Text class="text-lg text-gray-800">Hi {{ userName }},</Text>
          <Text class="text-sm text-gray-700">
            A passkey named {{ passkeyName }} was added to your RAGNA Studio account.
          </Text>
          <Text class="text-sm text-gray-700">
            If this wasn't you, remove it in your profile settings and sign out.
          </Text>
          <Button :href="settingsUrl"> Open profile settings </Button>
        </Container>
      </Tailwind>
    </Body>
  </Html>
</template>
