import { contextBridge, ipcRenderer } from 'electron';

import type {
  WindowControlChannel,
  WindowControlsApi,
} from '../shared/window-controls';
import type {
  LyorUpdaterApi,
  UpdateErrorCode,
  UpdateState,
  UpdateStatus,
  UpdaterInvokeChannel,
} from '../shared/updater';

// Sandboxed preloads have a deliberately limited CommonJS loader. Keep every
// runtime value in this file so the emitted preload requires only `electron`.
const PRELOAD_WINDOW_CONTROL_CHANNELS = {
  minimize: 'window-controls:minimize',
  maximize: 'window-controls:maximize',
  close: 'window-controls:close',
  getMaximized: 'window-controls:get-maximized',
  toggle: 'window-controls:toggle',
} as const satisfies Record<string, WindowControlChannel>;

const PRELOAD_UPDATER_CHANNELS = {
  getState: 'updater:get-state',
  checkForUpdates: 'updater:check-for-updates',
  downloadUpdate: 'updater:download-update',
  restartAndInstall: 'updater:restart-and-install',
  getAutoCheckEnabled: 'updater:get-auto-check-enabled',
  setAutoCheckEnabled: 'updater:set-auto-check-enabled',
  stateChanged: 'updater:state-changed',
} as const;

const UPDATE_STATUSES: ReadonlySet<string> = new Set<UpdateStatus>([
  'idle',
  'checking',
  'updateAvailable',
  'downloading',
  'downloaded',
  'upToDate',
  'error',
]);

const UPDATE_ERROR_CODES: ReadonlySet<string> = new Set<UpdateErrorCode>([
  'updatesUnavailableInDevelopment',
  'updateConfigurationMissing',
  'networkUnavailable',
  'checkFailed',
  'downloadFailed',
  'installNotReady',
]);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isUpdateState = (value: unknown): value is UpdateState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const progress = candidate.progress;
  const error = candidate.error;
  const progressRecord =
    typeof progress === 'object' && progress !== null && !Array.isArray(progress)
      ? (progress as Record<string, unknown>)
      : null;

  const hasValidProgress =
    progress === null ||
    (progressRecord !== null &&
      isNonNegativeFiniteNumber(progressRecord.percent) &&
      progressRecord.percent <= 100 &&
      isNonNegativeFiniteNumber(progressRecord.transferred) &&
      isNonNegativeFiniteNumber(progressRecord.total) &&
      isNonNegativeFiniteNumber(progressRecord.bytesPerSecond));

  const hasValidError =
    error === null ||
    (typeof error === 'object' &&
      !Array.isArray(error) &&
      error !== null &&
      typeof (error as Record<string, unknown>).code === 'string' &&
      UPDATE_ERROR_CODES.has((error as Record<string, unknown>).code as string) &&
      typeof (error as Record<string, unknown>).message === 'string');

  return (
    typeof candidate.status === 'string' &&
    UPDATE_STATUSES.has(candidate.status) &&
    typeof candidate.currentVersion === 'string' &&
    isNullableString(candidate.availableVersion) &&
    hasValidProgress &&
    isNullableString(candidate.releaseDate) &&
    isNullableString(candidate.releaseNotes) &&
    isNullableString(candidate.lastCheckedAt) &&
    hasValidError
  );
};

const invokeVoid = async (channel: WindowControlChannel): Promise<void> => {
  await ipcRenderer.invoke(channel);
};

const invokeBoolean = async (
  channel: WindowControlChannel | UpdaterInvokeChannel,
  ...args: readonly unknown[]
): Promise<boolean> => {
  const result: unknown = await ipcRenderer.invoke(channel, ...args);

  if (typeof result !== 'boolean') {
    throw new TypeError('Invalid boolean IPC response.');
  }

  return result;
};

const invokeUpdateState = async (
  channel: UpdaterInvokeChannel,
): Promise<UpdateState> => {
  const result: unknown = await ipcRenderer.invoke(channel);

  if (!isUpdateState(result)) {
    throw new TypeError('Invalid updater response.');
  }

  return result;
};

const windowControls: Readonly<WindowControlsApi> = Object.freeze({
  minimize: () => invokeVoid(PRELOAD_WINDOW_CONTROL_CHANNELS.minimize),
  maximize: () => invokeVoid(PRELOAD_WINDOW_CONTROL_CHANNELS.maximize),
  close: () => invokeVoid(PRELOAD_WINDOW_CONTROL_CHANNELS.close),
  getMaximized: () => invokeBoolean(PRELOAD_WINDOW_CONTROL_CHANNELS.getMaximized),
  toggle: () => invokeBoolean(PRELOAD_WINDOW_CONTROL_CHANNELS.toggle),
});

const lyorUpdater: Readonly<LyorUpdaterApi> = Object.freeze({
  getState: () => invokeUpdateState(PRELOAD_UPDATER_CHANNELS.getState),
  checkForUpdates: () =>
    invokeUpdateState(PRELOAD_UPDATER_CHANNELS.checkForUpdates),
  downloadUpdate: () =>
    invokeUpdateState(PRELOAD_UPDATER_CHANNELS.downloadUpdate),
  restartAndInstall: () =>
    invokeBoolean(PRELOAD_UPDATER_CHANNELS.restartAndInstall),
  getAutoCheckEnabled: () =>
    invokeBoolean(PRELOAD_UPDATER_CHANNELS.getAutoCheckEnabled),
  setAutoCheckEnabled: (enabled: boolean) =>
    invokeBoolean(PRELOAD_UPDATER_CHANNELS.setAutoCheckEnabled, enabled),
  onStateChange: (listener: (state: UpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isUpdateState(value)) {
        listener(value);
      }
    };

    ipcRenderer.on(PRELOAD_UPDATER_CHANNELS.stateChanged, handler);
    return () => {
      ipcRenderer.removeListener(PRELOAD_UPDATER_CHANNELS.stateChanged, handler);
    };
  },
});

contextBridge.exposeInMainWorld('windowControls', windowControls);
contextBridge.exposeInMainWorld('lyorUpdater', lyorUpdater);
