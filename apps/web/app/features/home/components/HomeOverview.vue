<script setup lang="ts">
import {
  BotIcon,
  FileTextIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  WorkflowIcon,
} from '@lucide/vue';
import HomeOverviewAgentTiles from '~/features/home/components/HomeOverviewAgentTiles.vue';
import HomeOverviewCalendar from '~/features/home/components/HomeOverviewCalendar.vue';
import HomeOverviewCard from '~/features/home/components/HomeOverviewCard.vue';
import HomeOverviewChatRows from '~/features/home/components/HomeOverviewChatRows.vue';
import HomeOverviewDocumentRows from '~/features/home/components/HomeOverviewDocumentRows.vue';
import HomeOverviewTaskRows from '~/features/home/components/HomeOverviewTaskRows.vue';
import HomeOverviewWorkflowRows from '~/features/home/components/HomeOverviewWorkflowRows.vue';
import { useHomeOverview } from '~/features/home/composables/useHomeOverview';

// Composables
const { t } = useI18n();
const { data, pending } = useHomeOverview();

// Computed
// One default per section so the template never has to guard against
// `undefined` while the first fetch is in flight (specs/home/prd.md,
// "Response": per-section `{ items, total }`).
const tasks = computed(() => data.value?.tasks.items ?? []);
const tasksTotal = computed(() => data.value?.tasks.total ?? 0);
const chats = computed(() => data.value?.chats.items ?? []);
const chatsTotal = computed(() => data.value?.chats.total ?? 0);
const workflows = computed(() => data.value?.workflows.items ?? []);
const workflowsTotal = computed(() => data.value?.workflows.total ?? 0);
const agents = computed(() => data.value?.agents.items ?? []);
const agentsTotal = computed(() => data.value?.agents.total ?? 0);
const documents = computed(() => data.value?.documents.items ?? []);
const documentsTotal = computed(() => data.value?.documents.total ?? 0);
const calendarTasks = computed(() => data.value?.calendarTasks ?? []);
</script>

<template>
  <!-- Two independent flex columns instead of a grid: cards differ in
       height, and grid rows would align tracks and leave a gap under the
       shorter card of each row (specs/home/prd.md, "UI design"). Desktop
       placement matches the PRD order (Tasks, Agents / Workflows, Calendar,
       Chats, Documents); on mobile the columns stack, so the order becomes
       Tasks, Documents, Workflows, Calendar, Agents, Chats. -->
  <div class="flex flex-col gap-6 md:flex-row">
    <div class="flex min-w-0 flex-1 flex-col gap-6">
      <HomeOverviewCard
        :icon="ListTodoIcon"
        icon-class="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        :title="t('home.overview.tasks.title')"
        :total="tasksTotal"
        view-all-to="/tasks"
        :loading="pending"
        :is-empty="tasks.length === 0"
        :empty-label="t('home.overview.tasks.empty')"
        :quick-create-label="t('home.overview.tasks.quickCreate')"
        quick-create-to="/tasks"
      >
        <HomeOverviewTaskRows :tasks="tasks" />
      </HomeOverviewCard>

      <HomeOverviewCard
        :icon="FileTextIcon"
        icon-class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        :title="t('home.overview.documents.title')"
        :total="documentsTotal"
        view-all-to="/document"
        :loading="pending"
        :is-empty="documents.length === 0"
        :empty-label="t('home.overview.documents.empty')"
        :quick-create-label="t('home.overview.documents.quickCreate')"
        quick-create-to="/document"
      >
        <HomeOverviewDocumentRows :documents="documents" />
      </HomeOverviewCard>

      <HomeOverviewCard
        :icon="WorkflowIcon"
        icon-class="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
        :title="t('home.overview.workflows.title')"
        :total="workflowsTotal"
        view-all-to="/workflow"
        :loading="pending"
        :is-empty="workflows.length === 0"
        :empty-label="t('home.overview.workflows.empty')"
        :quick-create-label="t('home.overview.workflows.quickCreate')"
        quick-create-to="/workflow/create"
      >
        <HomeOverviewWorkflowRows :workflows="workflows" />
      </HomeOverviewCard>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-6">
      <HomeOverviewCalendar :tasks="calendarTasks" :loading="pending" />

      <!-- Agents card skips the shell's quick-create footer: its tile grid
           already includes a dashed "create agent" tile that covers both
           the create action and the empty state (specs/home/prd.md, "Agents
           card"). -->
      <HomeOverviewCard
        :icon="BotIcon"
        icon-class="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        :title="t('home.overview.agents.title')"
        :total="agentsTotal"
        view-all-to="/agent"
        :loading="pending"
      >
        <HomeOverviewAgentTiles :agents="agents" />
      </HomeOverviewCard>

      <HomeOverviewCard
        :icon="MessagesSquareIcon"
        icon-class="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
        :title="t('home.overview.chats.title')"
        :total="chatsTotal"
        view-all-to="/chat/history"
        :loading="pending"
        :is-empty="chats.length === 0"
        :empty-label="t('home.overview.chats.empty')"
        :quick-create-label="t('home.overview.chats.quickCreate')"
        quick-create-to="/chat"
      >
        <HomeOverviewChatRows :chats="chats" />
      </HomeOverviewCard>
    </div>
  </div>
</template>
