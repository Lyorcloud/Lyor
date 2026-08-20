import { messages, type TranslationKey } from './messages';

export { messages } from './messages';
export type { TranslationKey } from './messages';

export const SUPPORTED_LOCALES = ['en', 'tr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type TranslationValues = Readonly<Record<string, string | number>>;

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  const template: string = messages[locale][key] ?? messages[DEFAULT_LOCALE][key];

  return template.replace(/\{\{(\w+)\}\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token,
  );
}
