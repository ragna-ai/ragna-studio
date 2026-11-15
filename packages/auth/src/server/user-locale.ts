import { DEFAULT_USER_LOCALE, userLocaleSchema, type UserLocale } from '@repo/utils';

interface PickUserLocaleInput {
  /** Sent by the client at sign-in start, so untrusted: anything unsupported is ignored. */
  requested?: unknown;
  acceptLanguage?: string | null;
}

interface WeightedLanguage {
  language: string;
  weight: number;
}

function parseAcceptLanguage(header: string): WeightedLanguage[] {
  return header
    .split(',')
    .map((part): WeightedLanguage => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split('-')[0] ?? '',
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    .filter(({ weight }) => weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

function firstSupportedLanguage(acceptLanguage: string): UserLocale | null {
  for (const { language } of parseAcceptLanguage(acceptLanguage)) {
    const supported = userLocaleSchema.safeParse(language);
    if (supported.success) return supported.data;
  }
  return null;
}

/** Language for a new user: the one the app asked for, else the browser's, else the default. */
export function pickUserLocale({ requested, acceptLanguage }: PickUserLocaleInput): UserLocale {
  const asked = userLocaleSchema.safeParse(requested);
  if (asked.success) return asked.data;
  return (acceptLanguage && firstSupportedLanguage(acceptLanguage)) || DEFAULT_USER_LOCALE;
}

/** A stored locale, or undefined when the user has none (or an unsupported one), so job defaults apply. */
export function readStoredLocale(locale: unknown): UserLocale | undefined {
  return userLocaleSchema.safeParse(locale).data;
}
