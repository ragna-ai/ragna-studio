export function useDateTimeFormat() {
  const { localeProperties } = useI18n();

  const dateTimeFormatter = computed(
    () =>
      new Intl.DateTimeFormat(localeProperties.value.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
  );

  const dateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(localeProperties.value.language, {
        dateStyle: 'medium',
      }),
  );

  function formatDateTime(isoDate: string | Date) {
    return dateTimeFormatter.value.format(new Date(isoDate));
  }

  /** Date-only (no time), for due dates and other day-granularity fields. */
  function formatDate(isoDate: string | Date) {
    return dateFormatter.value.format(new Date(isoDate));
  }

  return { formatDateTime, formatDate };
}
