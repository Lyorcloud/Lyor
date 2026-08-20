import { contextBridge, ipcRenderer } from 'electron';

import type {
  AppRole,
  AuthErrorCode,
  AuthResult,
  AuthState,
  AuthStatus,
  ForgotPasswordInput,
  LoginInput,
  LyorAuthApi,
  RegisterInput,
  UpdatePasswordInput,
} from '../shared/auth';
import type {
  CloudSettingsInput,
  CloudSyncState,
  DeviceSummaryInput,
  FavoriteMutationInput,
  LibraryRemoveInput,
  LibraryUpsertInput,
  LyorCloudSyncApi,
  SyncEventInput,
} from '../shared/cloud-sync';
import type {
  InstallationEngineResult,
  InstallationEngineState,
  InstallationTarget,
  LyorInstallationEngineApi,
  UninstallTarget,
} from '../shared/installation-engine';

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

const PRELOAD_AUTH_CHANNELS = {
  getState: 'auth:get-state',
  register: 'auth:register',
  login: 'auth:login',
  forgotPassword: 'auth:forgot-password',
  updatePassword: 'auth:update-password',
  refreshSession: 'auth:refresh-session',
  logout: 'auth:logout',
  stateChanged: 'auth:state-changed',
} as const;

const PRELOAD_CLOUD_SYNC_CHANNELS = {
  getState: 'cloud-sync:get-state', bootstrap: 'cloud-sync:bootstrap', updateSettings: 'cloud-sync:update-settings',
  setFavorite: 'cloud-sync:set-favorite', upsertLibrary: 'cloud-sync:upsert-library', removeLibrary: 'cloud-sync:remove-library',
  updateDeviceSummary: 'cloud-sync:update-device-summary', recordEvent: 'cloud-sync:record-event', retryPending: 'cloud-sync:retry-pending',
  stateChanged: 'cloud-sync:state-changed',
} as const;
const PRELOAD_INSTALLATION_ENGINE_CHANNELS = {
  getState: 'installation-engine:get-state',
  install: 'installation-engine:install',
  uninstall: 'installation-engine:uninstall',
} as const;

const AUTH_STATUSES: ReadonlySet<string> = new Set<AuthStatus>([
  'configurationRequired',
  'anonymous',
  'authenticated',
]);
const APP_ROLES: ReadonlySet<string> = new Set<AppRole>(['user', 'admin', 'super_admin']);
const AUTH_ERROR_CODES: ReadonlySet<string> = new Set<AuthErrorCode>([
  'configurationUnavailable',
  'invalidInput',
  'invalidCredentials',
  'emailNotVerified',
  'emailAlreadyRegistered',
  'passwordTooWeak',
  'rateLimited',
  'sessionExpired',
  'networkUnavailable',
  'requestFailed',
]);

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
  'updateRejected',
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

const isAuthState = (value: unknown): value is AuthState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const user = candidate.user;
  const validUser = user === null || (
    typeof user === 'object' && user !== null && !Array.isArray(user) &&
    typeof (user as Record<string, unknown>).id === 'string' &&
    typeof (user as Record<string, unknown>).email === 'string' &&
    typeof (user as Record<string, unknown>).emailVerified === 'boolean' &&
    typeof (user as Record<string, unknown>).role === 'string' &&
    APP_ROLES.has((user as Record<string, unknown>).role as string)
  );
  return typeof candidate.status === 'string' && AUTH_STATUSES.has(candidate.status) &&
    validUser && isNullableString(candidate.expiresAt) &&
    typeof candidate.passwordRecoveryPending === 'boolean';
};

const isAuthResult = (value: unknown): value is AuthResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const error = candidate.error;
  const validError = error === null || (
    typeof error === 'object' && error !== null && !Array.isArray(error) &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    AUTH_ERROR_CODES.has((error as Record<string, unknown>).code as string) &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
  return isAuthState(candidate.state) && validError &&
    (candidate.notice === null || candidate.notice === 'verificationSent' ||
      candidate.notice === 'resetSent' || candidate.notice === 'passwordUpdated');
};

const isCloudSyncState = (value: unknown): value is CloudSyncState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const statuses = ['signedOut', 'bootstrapping', 'ready', 'partial', 'offline'];
  const steps = candidate.steps;
  if (!statuses.includes(String(candidate.status)) || typeof candidate.pendingOperations !== 'number' ||
      !Number.isInteger(candidate.pendingOperations) || candidate.pendingOperations < 0 ||
      !(candidate.lastSyncedAt === null || typeof candidate.lastSyncedAt === 'string') ||
      typeof steps !== 'object' || steps === null || Array.isArray(steps)) return false;
  const validStep = (step: string) => ['pending', 'loading', 'ready', 'failed'].includes(String((steps as Record<string, unknown>)[step]));
  if (!['authenticate', 'profile', 'settings', 'favorites', 'library', 'device', 'deviceSummaries', 'home'].every(validStep)) return false;
  if (!(candidate.account === null || (typeof candidate.account === 'object' && !Array.isArray(candidate.account)))) return false;
  return candidate.error === null || (typeof candidate.error === 'object' && candidate.error !== null &&
    typeof (candidate.error as Record<string, unknown>).code === 'string' && typeof (candidate.error as Record<string, unknown>).message === 'string');
};
const isInstallationEngineResult = (value: unknown): value is InstallationEngineResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ok === 'boolean' &&
    ['not-installed', 'already-installed', 'update-available', 'reinstall-required'].includes(String(candidate.disposition)) &&
    isNullableString(candidate.modId) && isNullableString(candidate.version) &&
    (candidate.error === null || (typeof candidate.error === 'object' && candidate.error !== null &&
      typeof (candidate.error as Record<string, unknown>).code === 'string' &&
      typeof (candidate.error as Record<string, unknown>).message === 'string'));
};
const isInstallationEngineState = (value: unknown): value is InstallationEngineState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.detections) && Array.isArray(candidate.installed) &&
    candidate.detections.every((item) => typeof item === 'object' && item !== null &&
      typeof (item as Record<string, unknown>).detectionId === 'string' &&
      (item as Record<string, unknown>).verified === true && !('rootPath' in (item as Record<string, unknown>)) &&
      !('executablePath' in (item as Record<string, unknown>))) &&
    candidate.installed.every((item) => typeof item === 'object' && item !== null &&
      typeof (item as Record<string, unknown>).modId === 'string' &&
      typeof (item as Record<string, unknown>).version === 'string');
};

const invokeCloudSync = async (channel: string, input?: unknown): Promise<CloudSyncState> => {
  const result: unknown = input === undefined ? await ipcRenderer.invoke(channel) : await ipcRenderer.invoke(channel, input);
  if (!isCloudSyncState(result)) throw new TypeError('Invalid cloud-sync response.');
  return result;
};

const invokeAuthState = async (): Promise<AuthState> => {
  const result: unknown = await ipcRenderer.invoke(PRELOAD_AUTH_CHANNELS.getState);
  if (!isAuthState(result)) throw new TypeError('Invalid auth state response.');
  return result;
};

const invokeAuthResult = async (channel: string, input?: unknown): Promise<AuthResult> => {
  const result: unknown = input === undefined
    ? await ipcRenderer.invoke(channel)
    : await ipcRenderer.invoke(channel, input);
  if (!isAuthResult(result)) throw new TypeError('Invalid auth response.');
  return result;
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

const lyorAuth: Readonly<LyorAuthApi> = Object.freeze({
  getState: invokeAuthState,
  register: (input: RegisterInput) => invokeAuthResult(PRELOAD_AUTH_CHANNELS.register, input),
  login: (input: LoginInput) => invokeAuthResult(PRELOAD_AUTH_CHANNELS.login, input),
  forgotPassword: (input: ForgotPasswordInput) => invokeAuthResult(PRELOAD_AUTH_CHANNELS.forgotPassword, input),
  updatePassword: (input: UpdatePasswordInput) => invokeAuthResult(PRELOAD_AUTH_CHANNELS.updatePassword, input),
  refreshSession: () => invokeAuthResult(PRELOAD_AUTH_CHANNELS.refreshSession),
  logout: () => invokeAuthResult(PRELOAD_AUTH_CHANNELS.logout),
  onStateChange: (listener: (state: AuthState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isAuthState(value)) listener(value);
    };
    ipcRenderer.on(PRELOAD_AUTH_CHANNELS.stateChanged, handler);
    return () => ipcRenderer.removeListener(PRELOAD_AUTH_CHANNELS.stateChanged, handler);
  },
});

const lyorCloudSync: Readonly<LyorCloudSyncApi> = Object.freeze({
  getState: () => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.getState),
  bootstrap: () => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.bootstrap),
  updateSettings: (input: CloudSettingsInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.updateSettings, input),
  setFavorite: (input: FavoriteMutationInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.setFavorite, input),
  upsertLibrary: (input: LibraryUpsertInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.upsertLibrary, input),
  removeLibrary: (input: LibraryRemoveInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.removeLibrary, input),
  updateDeviceSummary: (input: DeviceSummaryInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.updateDeviceSummary, input),
  recordEvent: (input: SyncEventInput) => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.recordEvent, input),
  retryPending: () => invokeCloudSync(PRELOAD_CLOUD_SYNC_CHANNELS.retryPending),
  onStateChange: (listener: (state: CloudSyncState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isCloudSyncState(value)) listener(value);
    };
    ipcRenderer.on(PRELOAD_CLOUD_SYNC_CHANNELS.stateChanged, handler);
    return () => ipcRenderer.removeListener(PRELOAD_CLOUD_SYNC_CHANNELS.stateChanged, handler);
  },
});

const invokeEngineResult = async (channel: string, input: unknown): Promise<InstallationEngineResult> => {
  const result: unknown = await ipcRenderer.invoke(channel, input);
  if (!isInstallationEngineResult(result)) throw new TypeError('Invalid installation-engine response.');
  return result;
};
const lyorInstallationEngine: Readonly<LyorInstallationEngineApi> = Object.freeze({
  getState: async () => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_INSTALLATION_ENGINE_CHANNELS.getState);
    if (!isInstallationEngineState(result)) throw new TypeError('Invalid installation-engine state.');
    return result;
  },
  install: (input: InstallationTarget) => invokeEngineResult(PRELOAD_INSTALLATION_ENGINE_CHANNELS.install, input),
  uninstall: (input: UninstallTarget) => invokeEngineResult(PRELOAD_INSTALLATION_ENGINE_CHANNELS.uninstall, input),
});

contextBridge.exposeInMainWorld('windowControls', windowControls);
contextBridge.exposeInMainWorld('lyorUpdater', lyorUpdater);
contextBridge.exposeInMainWorld('lyorAuth', lyorAuth);
contextBridge.exposeInMainWorld('lyorCloudSync', lyorCloudSync);
contextBridge.exposeInMainWorld('lyorInstallationEngine', lyorInstallationEngine);
