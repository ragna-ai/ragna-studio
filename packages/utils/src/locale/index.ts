import * as z from 'zod';

/** Languages a user can pick for the app and their emails. Codes match the web app's i18n locales. */
export const USER_LOCALES = ['en', 'de'] as const;

export const userLocaleSchema = z.enum(USER_LOCALES);

export type UserLocale = z.infer<typeof userLocaleSchema>;

/** The web app's default language, also used when a user has none stored. */
export const DEFAULT_USER_LOCALE: UserLocale = 'de';
