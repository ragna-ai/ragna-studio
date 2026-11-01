<script setup lang="ts">
import { CardContent } from '~/components/ui/card';
import UserProfileForm from '~/features/user/components/UserProfileForm.vue';

const session = useAuthSession();
</script>

<template>
  <SettingsCard class="mx-auto w-full max-w-2xl">
    <CardContent>
      <UserProfileForm
        :name="session?.user.name ?? ''"
        :email="session?.user.email ?? ''"
      />
    </CardContent>
  </SettingsCard>
</template>
