import type { CloudSettings } from '../../electron/shared/cloud-sync';
import type { Locale } from '../i18n';
import type { ThemeId } from '../settings/AppSettingsContext';

const BASE_KEY = 'lyor.cloud-settings-base.v1';
let applyingRemote = false;

const read = (key: string, fallback: string): string => {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

export const applyRemotePreferences = (settings: CloudSettings, action: () => void): void => {
  applyingRemote = true;
  try {
    window.localStorage.setItem(BASE_KEY, settings.updatedAt);
    action();
  } finally {
    applyingRemote = false;
  }
};

export const queueCloudSettings = (overrides: {
  readonly theme?: ThemeId;
  readonly locale?: Locale;
  readonly autoDetectGames?: boolean;
}): void => {
  if (applyingRemote || !window.lyorCloudSync) return;
  const storedSettings = (() => {
    try { return JSON.parse(read('lyor.settings.v1', '{}')) as { theme?: ThemeId; autoDetectGames?: boolean }; }
    catch { return {}; }
  })();
  const theme = overrides.theme ?? storedSettings.theme ?? 'ice-max';
  const locale = overrides.locale ?? (read('lyor.locale.v1', 'en') as Locale);
  const autoDetectGames = overrides.autoDetectGames ?? storedSettings.autoDetectGames ?? false;
  const baseUpdatedAt = read(BASE_KEY, '') || null;
  void window.lyorCloudSync.updateSettings({ theme, locale, accountPreferences: { autoDetectGames }, baseUpdatedAt })
    .then((state) => {
      const updatedAt = state.account?.settings?.updatedAt;
      if (updatedAt) window.localStorage.setItem(BASE_KEY, updatedAt);
    })
    .catch(() => undefined);
};
