export function useDateTimeFormat() {
  const { localeProperties } = useI18n();

  const dateTimeFormatter = computed(
    () =>
      new Intl.DateTimeFormat(localeProperties.value.iso, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
  );

  function formatDateTime(isoDate: string) {
    return dateTimeFormatter.value.format(new Date(isoDate));
  }

  return { formatDateTime };
}
