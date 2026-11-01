const formattersByLocale = new Map<string, Intl.NumberFormat>();

/** Formats for display only, keeping every digit of the stored number. */
export function formatNumber(locale: string, value: number): string {
  let formatter = formattersByLocale.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
    formattersByLocale.set(locale, formatter);
  }
  return formatter.format(value);
}
