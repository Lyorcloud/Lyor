import {
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationValues,
} from './index';

import { I18nContext, type I18nContextValue } from './I18nContext';

const LOCALE_STORAGE_KEY = 'lyor.locale.v1';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(storedLocale)) {
      return storedLocale;
    }

    const windowsLocale = window.navigator.languages[0] ?? window.navigator.language;
    return windowsLocale.toLocaleLowerCase().startsWith('tr') ? 'tr' : DEFAULT_LOCALE;
  } catch {
    const windowsLocale = window.navigator.language;
    return windowsLocale.toLocaleLowerCase().startsWith('tr') ? 'tr' : DEFAULT_LOCALE;
  }
}

export function I18nProvider({ children }: PropsWithChildren): ReactElement {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Language selection still works for the current renderer session.
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
