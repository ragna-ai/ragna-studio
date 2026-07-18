<script setup lang="ts">
import DocumentEditor from '~/features/document/components/DocumentEditor.vue';
import { useGetDocument } from '~/features/document/composables/useDocumentApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

definePageMeta({
  validate: (route) => hasValidDocumentId(route.params),
});

const route = useRoute();
const documentId = computed(() => route.params.documentId as string);

// Composables
const workspaceScopeStore = useWorkspaceScopeStore();
const { t } = useI18n();

// Documents are always workspace-scoped (docs/documents/prd.md): the
// document itself carries its workspaceId, but the API needs it in the URL
// before the document has loaded, so this relies on the active workspace
// scope the same way the /document list page does.
const workspaceId = computed(() =>
  workspaceScopeStore.scope.kind === 'workspace'
    ? workspaceScopeStore.scope.workspaceId
    : null,
);

const { data: documentData, error: documentError } = useGetDocument(
  workspaceId,
  documentId,
);

useHead({
  title: computed(
    () => documentData.value?.document.title ?? t('document.editor.title'),
  ),
});
</script>

<template>
  <DocumentEditor
    v-if="documentData?.document"
    :key="documentData.document.id"
    :document="documentData.document"
    :workspace-id="documentData.document.workspaceId"
  />
  <div v-else-if="!workspaceId" class="flex h-full items-center justify-center">
    <p class="text-sm text-stone-500">
      {{ t('document.list.selectWorkspace') }}
    </p>
  </div>
  <div
    v-else-if="documentError"
    class="flex h-full items-center justify-center"
  >
    <p class="text-sm text-stone-500">
      {{ documentError.message || t('document.editor.loadError') }}
    </p>
  </div>
</template>
