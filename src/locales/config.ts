
// Shared i18n configuration used by the app runtime, Lingui CLI, and visual
// tests.
export const SUPPORTED_LOCALES = [
  "da",
  "de",
  "en",
  "es",
  "fr",
  "el",
  "hi",
  "id",
  "it",
  "ja",
  "nl",
  "pl",
  "pt-BR",
  "ru",
  "sv",
  "vi",
  "zh",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const SOURCE_LOCALE: Locale = "da";

export const isLocale = (locale: string): locale is Locale =>
  SUPPORTED_LOCALES.some((supported) => supported === locale);

export const detectLocale = (): Locale => SOURCE_LOCALE;

export const getLanguageTag = (locale: Locale): string => (locale === "zh" ? "zh-Hans" : locale);
