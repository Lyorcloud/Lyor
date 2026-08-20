import {
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AppSettingsContext,
  THEMES,
  type AppSettingsContextValue,
  type ThemeId,
} from './AppSettingsContext';

const SETTINGS_STORAGE_KEY = 'lyor.settings.v1';

interface PersistedAppSettings {
  readonly autoDetectGames: boolean;
  readonly theme: ThemeId;
  readonly version: 1;
}

const defaultSettings: PersistedAppSettings = {
  autoDetectGames: false,
  theme: 'ice-max',
  version: 1,
};

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function readSettings(): PersistedAppSettings {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return defaultSettings;
    }

    const candidate = JSON.parse(rawSettings) as Partial<PersistedAppSettings>;
    return {
      autoDetectGames: typeof candidate.autoDetectGames === 'boolean'
        ? candidate.autoDetectGames
        : defaultSettings.autoDetectGames,
      theme: isThemeId(candidate.theme) ? candidate.theme : defaultSettings.theme,
      version: 1,
    };
  } catch {
    return defaultSettings;
  }
}

function getInitialSettings(): PersistedAppSettings {
  const settings = readSettings();

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme === 'light' ? 'light' : 'dark';
  }

  return settings;
}

export function AppSettingsProvider({ children }: PropsWithChildren): ReactElement {
  const [settings, setSettings] = useState<PersistedAppSettings>(getInitialSettings);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme === 'light' ? 'light' : 'dark';

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Settings still apply for the current renderer session.
    }
  }, [settings]);

  const value = useMemo<AppSettingsContextValue>(() => ({
    autoDetectGames: settings.autoDetectGames,
    setAutoDetectGames: (autoDetectGames) => {
      setSettings((current) => ({ ...current, autoDetectGames }));
    },
    setTheme: (theme) => {
      setSettings((current) => ({ ...current, theme }));
    },
    theme: settings.theme,
  }), [settings.autoDetectGames, settings.theme]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
