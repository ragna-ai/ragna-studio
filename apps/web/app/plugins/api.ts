import { organizationKeys } from '~/features/organization/composables/useOrganizationApi';

interface ErrorBody {
  code?: unknown;
}

export default defineNuxtPlugin({
  setup() {
    const api = $fetch.create({
      baseURL: useRuntimeConfig().public.apiBaseUrl,
      credentials: 'include',
      onResponseError({ response }) {
        const body: ErrorBody | undefined = response._data;
        if (body?.code !== 'ORGANIZATION_DELETED') return;
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
