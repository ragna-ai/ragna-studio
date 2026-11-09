<script setup lang="ts">
import HomeOverviewAgentRows from '~/features/home/components/HomeOverviewAgentRows.vue';
import HomeOverviewCard from '~/features/home/components/HomeOverviewCard.vue';
import HomeOverviewTaskRows from '~/features/home/components/HomeOverviewTaskRows.vue';
import HomeOverviewTodayRows from '~/features/home/components/HomeOverviewTodayRows.vue';
import HomeOverviewWorkflowRows from '~/features/home/components/HomeOverviewWorkflowRows.vue';
import { useHomeDashboard } from '~/features/home/composables/useHomeDashboard';

const { t } = useI18n();
const {
  pending,
  tasks,
  tasksTotal,
  workflows,
  workflowsTotal,
  agents,
  agentsTotal,
  todayTasks,
} = useHomeDashboard();
</script>

<template>
  <div class="grid grid-cols-1 gap-(--gap-card) lg:grid-cols-12">
    <div class="flex min-w-0 flex-col gap-(--gap-card) lg:col-span-8">
      <HomeOverviewCard
        icon="hugeicons:check-list"
        :title="t('home.dashboard.tasks.title')"
        :total="tasksTotal"
        view-all-to="/tasks"
        :action-label="t('home.dashboard.viewAll')"
        :loading="pending"
        :is-empty="tasks.length === 0"
        :empty-label="t('home.dashboard.tasks.empty')"
        :quick-create-label="t('home.dashboard.tasks.quickCreate')"
        quick-create-to="/tasks"
      >
        <HomeOverviewTaskRows :tasks="tasks" />
      </HomeOverviewCard>

      <HomeOverviewCard
        icon="hugeicons:workflow-square-01"
        :title="t('home.dashboard.workflows.title')"
        :total="workflowsTotal"
        view-all-to="/workflow"
        :action-label="t('home.dashboard.workflows.viewAll')"
        :loading="pending"
        :is-empty="workflows.length === 0"
        :empty-label="t('home.dashboard.workflows.empty')"
        :quick-create-label="t('home.dashboard.workflows.quickCreate')"
        quick-create-to="/workflow/create"
      >
        <HomeOverviewWorkflowRows :workflows="workflows" />
      </HomeOverviewCard>
    </div>

    <div class="flex min-w-0 flex-col gap-(--gap-card) lg:col-span-4">
      <HomeOverviewCard
        icon="hugeicons:robotic"
        :title="t('home.dashboard.agents.title')"
        :total="agentsTotal"
        view-all-to="/agent"
        :action-label="t('home.dashboard.agents.manage')"
        :loading="pending"
        :is-empty="agents.length === 0"
        :empty-label="t('home.dashboard.agents.empty')"
        :quick-create-label="t('home.dashboard.agents.quickCreate')"
        quick-create-to="/agent/create"
      >
        <HomeOverviewAgentRows :agents="agents" />
      </HomeOverviewCard>

      <HomeOverviewCard
        icon="hugeicons:calendar-03"
        :title="t('home.dashboard.today.title')"
        :total="todayTasks.length"
        :loading="pending"
        :is-empty="todayTasks.length === 0"
        :empty-label="t('home.dashboard.today.empty')"
        :quick-create-label="t('home.dashboard.today.quickCreate')"
        quick-create-to="/tasks"
      >
        <HomeOverviewTodayRows :tasks="todayTasks" />
      </HomeOverviewCard>
    </div>
  </div>
</template>
