import { createContext, useContext } from 'react';

export const THEMES = ['ice-max', 'dark', 'light'] as const;
export type ThemeId = (typeof THEMES)[number];

export interface AppSettingsContextValue {
  readonly autoDetectGames: boolean;
  readonly setAutoDetectGames: (enabled: boolean) => void;
  readonly setTheme: (theme: ThemeId) => void;
  readonly theme: ThemeId;
}

export const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

export function useAppSettings(): AppSettingsContextValue {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error('useAppSettings must be used inside AppSettingsProvider.');
  }

  return context;
}
