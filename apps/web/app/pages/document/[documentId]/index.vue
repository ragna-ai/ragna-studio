<script setup lang="ts">
import { storeToRefs } from 'pinia';
import DocumentEditor from '~/features/document/components/DocumentEditor.vue';
import { useGetDocument } from '~/features/document/composables/useDocumentApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

definePageMeta({
  validate: (route) => hasValidDocumentId(route.params),
});

const route = useRoute();
const documentId = computed(() => route.params.documentId as string);

// Composables
// Documents are always workspace-scoped (docs/documents/prd.md): the
// document itself carries its workspaceId, but the API needs it in the URL
// before the document has loaded, so this relies on the active workspace
// the same way the /document list page does. activeWorkspaceId is only
// briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { t } = useI18n();

const { data: documentData, error: documentError } = useGetDocument(documentId);

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
  />
  <div v-else-if="!activeWorkspaceId" class="flex h-full items-center justify-center">
    <p class="text-sm text-stone-500">
      {{ t('document.list.loading') }}
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
