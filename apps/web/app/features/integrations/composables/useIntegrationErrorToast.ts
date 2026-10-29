import { toast } from 'vue-sonner';
import { omitQueryParam } from '~/lib/omit-query-param';
import { INTEGRATION_ERROR_QUERY_PARAM } from '~/features/integrations/lib/integration-meta';

const KNOWN_ERROR_CODES = [
  'invalid_state',
  'invalid_request',
  'access_denied',
  'provider_error',
  'exchange_failed',
  'email_mismatch',
] as const;

/** Shows the error the OAuth callback appended to the return URL, then removes it from the URL. */
export function useIntegrationErrorToast() {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();

  watchEffect(() => {
    const code = route.query[INTEGRATION_ERROR_QUERY_PARAM];
    if (typeof code !== 'string') return;

    const known = KNOWN_ERROR_CODES.find((candidate) => candidate === code);
    toast.error(t(`integrations.errors.${known ?? 'provider_error'}`));

    router.replace({
      query: omitQueryParam(route.query, INTEGRATION_ERROR_QUERY_PARAM),
    });
  });
}
