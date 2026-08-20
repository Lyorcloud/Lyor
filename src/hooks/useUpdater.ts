import { useCallback, useEffect, useState } from 'react';

import type { LyorUpdaterApi, UpdateState } from '../../electron/shared/updater';

export type { UpdateState } from '../../electron/shared/updater';

const unavailableState: UpdateState = {
  availableVersion: null,
  currentVersion: '—',
  error: null,
  lastCheckedAt: null,
  progress: null,
  releaseDate: null,
  releaseNotes: null,
  status: 'idle',
};

function getUpdaterApi(): Readonly<LyorUpdaterApi> | undefined {
  return typeof window.lyorUpdater?.getState === 'function' ? window.lyorUpdater : undefined;
}

export interface UseUpdaterResult {
  readonly autoCheckEnabled: boolean;
  readonly bridgeAvailable: boolean;
  readonly checkForUpdates: () => Promise<void>;
  readonly downloadUpdate: () => Promise<void>;
  readonly restartAndInstall: () => Promise<void>;
  readonly setAutoCheckEnabled: (enabled: boolean) => Promise<void>;
  readonly state: UpdateState;
}

export function useUpdater(): UseUpdaterResult {
  const [state, setState] = useState<UpdateState>(unavailableState);
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState(true);
  const bridgeAvailable = Boolean(getUpdaterApi());

  useEffect(() => {
    const api = getUpdaterApi();
    if (!api) {
      return undefined;
    }

    let active = true;
    const unsubscribe = api.onStateChange((nextState) => {
      if (active) {
        setState(nextState);
      }
    });

    void Promise.all([api.getState(), api.getAutoCheckEnabled()])
      .then(([nextState, enabled]) => {
        if (active) {
          setState(nextState);
          setAutoCheckEnabledState(enabled);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const invoke = useCallback(async (
    action: (api: Readonly<LyorUpdaterApi>) => Promise<unknown>,
  ): Promise<void> => {
    const api = getUpdaterApi();
    if (!api) {
      return;
    }

    try {
      await action(api);
    } catch {
      // Main owns the user-safe error state and publishes it through onStateChange.
    }
  }, []);

  const setAutoCheckEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    const api = getUpdaterApi();
    if (!api) {
      return;
    }

    try {
      const persistedValue = await api.setAutoCheckEnabled(enabled);
      setAutoCheckEnabledState(persistedValue);
    } catch {
      // Keep the main-owned persisted preference unchanged when IPC fails.
    }
  }, []);

  return {
    autoCheckEnabled,
    bridgeAvailable,
    checkForUpdates: () => invoke((api) => api.checkForUpdates()),
    downloadUpdate: () => invoke((api) => api.downloadUpdate()),
    restartAndInstall: () => invoke((api) => api.restartAndInstall()),
    setAutoCheckEnabled,
    state,
  };
}
