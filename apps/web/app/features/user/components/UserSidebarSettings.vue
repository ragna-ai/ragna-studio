<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { useNavSidebarStore } from '~/stores/navsidebar.store';

const navSidebarStore = useNavSidebarStore();
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ $t('user.sidebar.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <p class="mb-4 text-sm text-muted-foreground">
        {{ $t('user.sidebar.subtitle') }}
      </p>
      <div class="flex items-center gap-2">
        <Switch
          id="show-labels-when-collapsed"
          v-model="navSidebarStore.showLabelsWhenCollapsed"
        />
        <Label for="show-labels-when-collapsed" class="text-sm">
          {{ $t('user.sidebar.showLabelsWhenCollapsed') }}
        </Label>
      </div>
    </CardContent>
  </Card>
</template>
