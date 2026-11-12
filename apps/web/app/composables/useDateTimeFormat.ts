const DAY_SECONDS = 86400;
const RELATIVE_UNITS: { name: Intl.RelativeTimeFormatUnit; seconds: number }[] =
  [
    { name: 'week', seconds: 7 * 86400 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
  ];

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

  const shortDateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(localeProperties.value.language, {
        day: 'numeric',
        month: 'short',
      }),
  );

  const relativeFormatter = computed(
    () =>
      new Intl.RelativeTimeFormat(localeProperties.value.language, {
        numeric: 'auto',
        style: 'short',
      }),
  );

  function formatDateTime(isoDate: string | Date) {
    return dateTimeFormatter.value.format(new Date(isoDate));
  }

  /** Date-only (no time), for due dates and other day-granularity fields. */
  function formatDate(isoDate: string | Date) {
    return dateFormatter.value.format(new Date(isoDate));
  }

  /** "5 min. ago" within a day, "yesterday", then a short date like "10 Nov". */
  function formatRelative(isoDate: string | Date) {
    const date = new Date(isoDate);
    const elapsedSeconds = (date.getTime() - Date.now()) / 1000;
    const ageSeconds = Math.abs(elapsedSeconds);
    if (ageSeconds >= 2 * DAY_SECONDS) {
      return shortDateFormatter.value.format(date);
    }
    const unit = RELATIVE_UNITS.find(
      (candidate) => ageSeconds >= candidate.seconds,
    );
    if (!unit) {
      return relativeFormatter.value.format(0, 'second');
    }
    return relativeFormatter.value.format(
      Math.round(elapsedSeconds / unit.seconds),
      unit.name,
    );
  }

  return { formatDateTime, formatDate, formatRelative };
}
