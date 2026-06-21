import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

export type AuthClient = ReturnType<typeof createAuthClient>;
export const authClient: AuthClient = createAuthClient({
  plugins: [adminClient()],
});
export { createAuthClient };
