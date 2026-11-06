import { getProblemType } from '~/lib/api-error';
import { organizationKeys } from '~/features/organization/composables/useOrganizationApi';

export default defineNuxtPlugin({
  setup() {
    const api = $fetch.create({
      baseURL: useRuntimeConfig().public.apiBaseUrl,
      credentials: 'include',
      onResponseError({ response }) {
        const isOrganizationDeleted =
          getProblemType({ data: response._data }) === 'organization-deleted';
        if (!isOrganizationDeleted) return;
        // Refetching GET /organization makes the layout show the restore screen.
        useNuxtApp().$queryClient.invalidateQueries({
          queryKey: organizationKeys.detail,
        });
      },
    });

    return {
      provide: {
        api,
      },
    };
  },
});
