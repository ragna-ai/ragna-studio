import { isSettingsPath, rememberReturnPath } from '~/lib/settings-return-path';

export default defineNuxtPlugin(() => {
  useRouter().afterEach((to, from) => {
    if (isSettingsPath(to.path) && !isSettingsPath(from.path)) {
      rememberReturnPath(from.fullPath);
    }
  });
});
