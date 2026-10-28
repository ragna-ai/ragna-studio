<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import WorkflowFieldError from '~/features/workflow/components/WorkflowFieldError.vue';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';
import { getAgentSlotLabel } from '~/features/workflow/lib/agent-slot';
import { findFieldIssue } from '~/features/workflow/lib/validate-draft';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';
import { WORKFLOW_VALIDATION_KEY } from '~/features/workflow/types/validation';

// Imports

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
const validation = inject(WORKFLOW_VALIDATION_KEY, null);
const { t } = useI18n();

// Computed
const agentOptions = computed(() => agentsData.value?.agents ?? []);

const members = computed(() => props.node.data.config.members);
const canAddMember = computed(() => members.value.length < MAX_MEMBERS);
const canRemoveMember = computed(() => members.value.length > MIN_MEMBERS);

// Functions
function fieldIssue(field: string) {
  return findFieldIssue(validation?.value, props.node.id, field);
}

function memberLabel(agentId: string) {
  return getAgentSlotLabel(agentId, agentsData.value, t);
}

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
  <div class="space-y-6">
    <section class="space-y-4">
      <div>
        <h3 class="text-sm font-semibold">
          {{ t('workflow.teamConfig.lead') }}
        </h3>
        <p class="text-xs text-muted-foreground">
          {{ t('workflow.teamConfig.leadIntro') }}
        </p>
      </div>

      <div>
        <Label class="mb-2 block text-sm font-medium">{{
          t(NODE_TYPE_LABEL_KEYS.agent)
        }}</Label>
        <Select v-model="node.data.config.leadAgentId">
          <SelectTrigger
            class="w-full"
            :aria-invalid="!!fieldIssue('leadAgentId')"
          >
            <SelectValue :placeholder="t('workflow.agentPicker.placeholder')" />
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
        <p v-if="isLoadingAgents" class="mt-1 text-xs text-muted-foreground">
          {{ t('workflow.agentPicker.loading') }}
        </p>
        <WorkflowFieldError :issue="fieldIssue('leadAgentId')" />
      </div>

      <div>
        <Label class="mb-2 block text-sm font-medium">{{
          t('common.prompt')
        }}</Label>
        <Textarea v-model="node.data.config.prompt" rows="6" />
        <WorkflowFieldError :issue="fieldIssue('prompt')" />
        <WorkflowTemplateHint class="mt-1" />
      </div>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold">
          {{
            t('workflow.teamConfig.membersWithCount', {
              count: members.length,
              max: MAX_MEMBERS,
            })
          }}
        </h3>
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

      <TooltipProvider>
        <div class="space-y-3">
          <div
            v-for="(member, index) in members"
            :key="index"
            class="space-y-3 rounded-md border p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-medium">{{
                memberLabel(member.agentId)
              }}</span>
              <Tooltip>
                <TooltipTrigger as-child>
                  <span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-6"
                      :aria-label="t('workflow.teamConfig.removeMember')"
                      :disabled="!canRemoveMember"
                      @click="removeMember(index)"
                    >
                      <Trash2Icon
                        class="size-3.5 stroke-1.5 text-destructive"
                      />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent v-if="!canRemoveMember">
                  {{ t('workflow.teamConfig.removeDisabledReason') }}
                </TooltipContent>
              </Tooltip>
            </div>

            <div>
              <Select v-model="member.agentId">
                <SelectTrigger
                  class="w-full"
                  :aria-invalid="!!fieldIssue(`members.${index}.agentId`)"
                >
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
              <WorkflowFieldError
                :issue="fieldIssue(`members.${index}.agentId`)"
              />
            </div>

            <div>
              <Label class="mb-2 block text-sm font-medium">{{
                t('workflow.teamConfig.roleLabel')
              }}</Label>
              <Input
                v-model="member.role"
                :placeholder="t('workflow.teamConfig.rolePlaceholder')"
              />
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('workflow.teamConfig.roleHint') }}
              </p>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </section>
  </div>
</template>
