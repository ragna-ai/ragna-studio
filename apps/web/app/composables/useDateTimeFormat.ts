export function useDateTimeFormat() {
  const { localeProperties } = useI18n();

  const dateTimeFormatter = computed(
    () =>
      new Intl.DateTimeFormat(localeProperties.value.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
  );

  function formatDateTime(isoDate: string) {
    return dateTimeFormatter.value.format(new Date(isoDate));
  }

  return { formatDateTime };
}
