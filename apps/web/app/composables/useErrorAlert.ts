export function useErrorAlert() {
  const error = useState<string | null>('error-alert', () => null);

  function setError(message: string) {
    error.value = message;
  }

  function clearError() {
    error.value = null;
  }

  return { error, setError, clearError };
}
