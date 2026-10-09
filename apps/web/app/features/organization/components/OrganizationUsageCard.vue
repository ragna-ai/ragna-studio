<script setup lang="ts">
import { useGetOrganizationUsage } from '~/features/organization/composables/useOrganizationApi';

const { t, n } = useI18n();
const { data, isPending, error } = useGetOrganizationUsage(true);
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader>
      <CardTitle>{{ t('organization.usage.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p v-else-if="error" class="text-sm text-destructive">
        {{ t('organization.usage.loadError') }}
      </p>
      <p
        v-else-if="!data?.members.length"
        class="text-sm text-muted-foreground"
      >
        {{ t('organization.usage.empty') }}
      </p>
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>{{ t('common.name') }}</TableHead>
            <TableHead class="text-right">{{
              t('organization.usage.events')
            }}</TableHead>
            <TableHead class="text-right">{{
              t('organization.usage.credits')
            }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="member in data.members"
            :key="member.userId ?? 'former-member'"
          >
            <TableCell>{{
              member.name ?? t('organization.formerMember')
            }}</TableCell>
            <TableCell class="text-right">{{ member.eventCount }}</TableCell>
            <TableCell class="text-right">
              {{ n(member.credits, { maximumFractionDigits: 2 }) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
