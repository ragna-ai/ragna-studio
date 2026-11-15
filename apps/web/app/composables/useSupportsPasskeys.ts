/** True once mounted in a browser that supports WebAuthn (the app is a client-only SPA). */
export function useSupportsPasskeys(): Ref<boolean> {
  const supported = ref(false);
  onMounted(() => {
    supported.value = 'PublicKeyCredential' in window;
  });
  return supported;
}
