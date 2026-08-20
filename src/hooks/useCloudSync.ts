import { useEffect, useState } from 'react';

import type { AuthStatus } from '../../electron/shared/auth';
import type { CloudSyncState } from '../../electron/shared/cloud-sync';
import { useI18n } from '../i18n/I18nContext';
import { useAppSettings } from '../settings/AppSettingsContext';
import { applyRemotePreferences } from '../services/cloudSettingsClient';
import { hydrateCloudAccountState, reconcileCloudAccountState } from '../services/mockModService';

const initialState: CloudSyncState = {
  status: 'signedOut',
  steps: { authenticate: 'pending', profile: 'pending', settings: 'pending', favorites: 'pending', library: 'pending', device: 'pending', deviceSummaries: 'pending', home: 'pending' },
  account: null, pendingOperations: 0, lastSyncedAt: null, error: null,
};

export function useCloudSync(authStatus: AuthStatus): CloudSyncState {
  const [state, setState] = useState(initialState);
  const { locale, setLocale } = useI18n();
  const { autoDetectGames, setAutoDetectGames, setTheme, theme } = useAppSettings();

  useEffect(() => {
    const bridge = (window as Window & { lyorCloudSync?: Window['lyorCloudSync'] }).lyorCloudSync;
    if (!bridge) return;
    let active = true;
    void bridge.getState().then((next) => { if (active) setState(next); }).catch(() => undefined);
    const unsubscribe = bridge.onStateChange((next) => { if (active) setState(next); });
    if (authStatus === 'authenticated') void bridge.bootstrap().then((next) => { if (active) setState(next); });
    return () => { active = false; unsubscribe(); };
  }, [authStatus]);

  useEffect(() => {
    const settings = state.account?.settings;
    if (!settings) return;
    applyRemotePreferences(settings, () => {
      if (settings.theme !== theme) setTheme(settings.theme);
      if (settings.locale !== locale) setLocale(settings.locale);
      if (settings.accountPreferences.autoDetectGames !== autoDetectGames) {
        setAutoDetectGames(settings.accountPreferences.autoDetectGames);
      }
    });
  }, [autoDetectGames, locale, setAutoDetectGames, setLocale, setTheme, state.account?.settings, theme]);

  useEffect(() => {
    const account = state.account;
    if (!account) return;
    hydrateCloudAccountState(account);
    void reconcileCloudAccountState(account);
  }, [state.account]);

  useEffect(() => {
    if (state.pendingOperations === 0 || authStatus !== 'authenticated') return;
    const retry = () => void window.lyorCloudSync.retryPending().then(setState).catch(() => undefined);
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener('online', retry);
    return () => { window.clearInterval(timer); window.removeEventListener('online', retry); };
  }, [authStatus, state.pendingOperations]);

  return state;
}
