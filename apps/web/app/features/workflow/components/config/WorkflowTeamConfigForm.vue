<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';

// Imports

const NO_AGENT = '__none__';
const MIN_MEMBERS = 1;
const MAX_MEMBERS = 5;

// Props
// The panel only renders this form when node.type === 'team', so the
// narrowed node (and therefore its config) is guaranteed to be TeamConfig.
const props = defineProps<{
  node: Extract<WorkflowNode, { type: 'team' }>;
}>();

// Composables
const { data: agentsData, isLoading: isLoadingAgents } = useGetAllAgents();
const { t } = useI18n();

// Computed
const agentOptions = computed(() => agentsData.value?.agents ?? []);

const selectedLeadAgentId = computed({
  get: () => props.node.data.config.leadAgentId ?? NO_AGENT,
  set: (value: string) => {
    props.node.data.config.leadAgentId = value === NO_AGENT ? undefined : value;
  },
});

const members = computed(() => props.node.data.config.members);
const canAddMember = computed(() => members.value.length < MAX_MEMBERS);
const canRemoveMember = computed(() => members.value.length > MIN_MEMBERS);

// Functions
function addMember() {
  if (!canAddMember.value) return;
  members.value.push({ agentId: '', role: '' });
}

function removeMember(index: number) {
  if (!canRemoveMember.value) return;
  members.value.splice(index, 1);
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('workflow.teamConfig.leadAgentLabel')
      }}</Label>
      <Select v-model="selectedLeadAgentId">
        <SelectTrigger class="w-full">
          <SelectValue :placeholder="t('workflow.agentPicker.placeholder')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_AGENT">{{
            t('workflow.teamConfig.noneUseDefaultAgent')
          }}</SelectItem>
          <SelectItem
            v-for="agent in agentOptions"
            :key="agent.id"
            :value="agent.id"
          >
            {{ agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="isLoadingAgents" class="mt-1 text-xs text-muted-foreground">
        {{ t('workflow.agentPicker.loading') }}
      </p>
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('common.prompt')
      }}</Label>
      <Textarea v-model="node.data.config.prompt" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between">
        <Label class="text-sm font-medium">{{
          t('workflow.teamConfig.membersLabel')
        }}</Label>
        <Button
          variant="outline"
          size="sm"
          :disabled="!canAddMember"
          @click="addMember"
        >
          <PlusIcon class="size-3.5 stroke-1.5" />
          {{ t('workflow.teamConfig.addMember') }}
        </Button>
      </div>

      <div class="space-y-3">
        <div
          v-for="(member, index) in members"
          :key="index"
          class="space-y-2 rounded-md border p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted-foreground">{{
              t('workflow.teamConfig.memberN', { index: index + 1 })
            }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :aria-label="t('workflow.teamConfig.removeMember')"
              :disabled="!canRemoveMember"
              @click="removeMember(index)"
            >
              <Trash2Icon class="size-3.5 stroke-1.5 text-destructive" />
            </Button>
          </div>

          <Select v-model="member.agentId">
            <SelectTrigger class="w-full">
              <SelectValue
                :placeholder="t('workflow.agentPicker.placeholder')"
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="agent in agentOptions"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Input
            v-model="member.role"
            :placeholder="t('workflow.teamConfig.rolePlaceholder')"
          />
        </div>
      </div>

      <p class="mt-2 text-xs text-muted-foreground">
        {{ t('workflow.teamConfig.note') }}
      </p>
    </div>
  </div>
</template>
