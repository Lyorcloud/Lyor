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
  LyorPlanariaApi,
  PlanariaBillboardMutationInput,
  PlanariaBillboardUploadInput,
  PlanariaCreateAdminInput,
  PlanariaDashboardSnapshot,
  PlanariaFilePurpose,
  PlanariaFileSelection,
  PlanariaModMediaUploadInput,
  PlanariaPackageUploadInput,
  PlanariaSaveDraftInput,
  PlanariaSaveDraftResult,
  PlanariaTargetPathSelection,
  PlanariaTransitionInput,
  PlanariaUploadProgress,
  PublicBillboardItem,
} from '../shared/planaria';
import type { PlanariaAuthApi } from '../shared/planaria-auth';

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
const PRELOAD_PLANARIA_AUTH_CHANNELS = {
  getState: 'planaria-auth:get-state',
  login: 'planaria-auth:login',
  logout: 'planaria-auth:logout',
  stateChanged: 'planaria-auth:state-changed',
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
const PRELOAD_PLANARIA_CHANNELS = {
  getDashboard: 'planaria:get-dashboard', getPublicBillboards: 'planaria:get-public-billboards',
    selectFile: 'planaria:select-file', selectTargetPath: 'planaria:select-target-path', saveDraft: 'planaria:save-draft',
  uploadPackage: 'planaria:upload-package', uploadModMedia: 'planaria:upload-mod-media',
  uploadBillboard: 'planaria:upload-billboard', transitionVersion: 'planaria:transition-version',
  mutateBillboard: 'planaria:mutate-billboard', createAdmin: 'planaria:create-admin',
  uploadProgress: 'planaria:upload-progress',
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSafeMediaUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) && !url.username && !url.password;
  } catch { return false; }
};

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

const hasNoPrivilegedFields = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(hasNoPrivilegedFields);
  if (!isRecord(value)) return true;
  if (['objectKey', 'object_key', 'localPath', 'uploadUrl', 'providerUploadId']
    .some((key) => key in value)) return false;
  if ('previewUrl' in value && value.previewUrl !== null && !isSafeMediaUrl(value.previewUrl)) return false;
  return Object.values(value).every(hasNoPrivilegedFields);
};
const isPlanariaDashboard = (value: unknown): value is PlanariaDashboardSnapshot => {
  if (!isRecord(value) || !isRecord(value.access) || !isRecord(value.stats) || !hasNoPrivilegedFields(value)) return false;
  if (!['admin', 'super_admin'].includes(String(value.access.role)) || typeof value.access.canManageAdmins !== 'boolean') return false;
  if (!['totalMods', 'publishedMods', 'completedDownloads', 'activeBillboards', 'adminAccounts']
    .every((key) => isNonNegativeFiniteNumber((value.stats as Record<string, unknown>)[key]))) return false;
  return ['games', 'mods', 'versions', 'packages', 'media', 'billboards', 'accounts', 'recentActivity']
    .every((key) => Array.isArray(value[key]));
};
const isPublicBillboard = (value: unknown): value is PublicBillboardItem =>
  isRecord(value) && typeof value.id === 'string' && (value.kind === 'image' || value.kind === 'video') &&
  typeof value.alt === 'string' && Number.isInteger(value.displayOrder) && value.published === true &&
  isSafeMediaUrl(value.src);
const isPlanariaFileSelection = (value: unknown): value is PlanariaFileSelection =>
  isRecord(value) && typeof value.id === 'string' &&
  ['mod-package', 'mod-image', 'billboard'].includes(String(value.purpose)) &&
  typeof value.name === 'string' && typeof value.mimeType === 'string' &&
  isNonNegativeFiniteNumber(value.size) && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256) &&
  hasNoPrivilegedFields(value);
const isPlanariaTargetPathSelection = (value: unknown): value is PlanariaTargetPathSelection =>
  isRecord(value) && Object.keys(value).length === 1 && typeof value.relativePath === 'string' &&
  value.relativePath.length > 0 && value.relativePath.length <= 1024 &&
  !value.relativePath.startsWith('/') && !/^[a-z]:/iu.test(value.relativePath) &&
  !value.relativePath.split('/').includes('..') && !value.relativePath.includes('\0');
const isPlanariaSaveDraftResult = (value: unknown): value is PlanariaSaveDraftResult =>
  isRecord(value) && typeof value.versionId === 'string' && typeof value.modUpdatedAt === 'string' &&
  typeof value.versionUpdatedAt === 'string';
const isPlanariaUploadProgress = (value: unknown): value is PlanariaUploadProgress =>
  isRecord(value) && typeof value.uploadId === 'string' &&
  ['mod-package', 'mod-image', 'billboard'].includes(String(value.purpose)) &&
  ['preparing', 'uploading', 'finalizing', 'success', 'error'].includes(String(value.status)) &&
  isNonNegativeFiniteNumber(value.percent) && Number(value.percent) <= 100 &&
  isNonNegativeFiniteNumber(value.transferred) && isNonNegativeFiniteNumber(value.total) && isNullableString(value.error);

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

const planariaAuth: Readonly<PlanariaAuthApi> = Object.freeze({
  getState: async () => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_AUTH_CHANNELS.getState);
    if (!isAuthState(result)) throw new TypeError('Invalid Planaria auth state.');
    return result;
  },
  login: (input: LoginInput) => invokeAuthResult(PRELOAD_PLANARIA_AUTH_CHANNELS.login, input),
  logout: () => invokeAuthResult(PRELOAD_PLANARIA_AUTH_CHANNELS.logout),
  onStateChange: (listener: (state: AuthState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isAuthState(value)) listener(value);
    };
    ipcRenderer.on(PRELOAD_PLANARIA_AUTH_CHANNELS.stateChanged, handler);
    return () => ipcRenderer.removeListener(PRELOAD_PLANARIA_AUTH_CHANNELS.stateChanged, handler);
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

const invokePlanariaVoid = async (channel: string, input: unknown): Promise<void> => {
  const result: unknown = await ipcRenderer.invoke(channel, input);
  if (result !== undefined && result !== null) throw new TypeError('Invalid Planaria response.');
};
const lyorPlanaria: Readonly<LyorPlanariaApi> = Object.freeze({
  getDashboard: async () => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_CHANNELS.getDashboard);
    if (!isPlanariaDashboard(result)) throw new TypeError('Invalid Planaria dashboard response.');
    return result;
  },
  getPublicBillboards: async () => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_CHANNELS.getPublicBillboards);
    if (!Array.isArray(result) || !result.every(isPublicBillboard)) throw new TypeError('Invalid billboard feed response.');
    return result;
  },
  selectFile: async (purpose: PlanariaFilePurpose) => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_CHANNELS.selectFile, purpose);
    if (result === null) return null;
    if (!isPlanariaFileSelection(result)) throw new TypeError('Invalid selected-file response.');
    return result;
  },
  selectTargetPath: async () => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_CHANNELS.selectTargetPath);
    if (result === null) return null;
    if (!isPlanariaTargetPathSelection(result)) throw new TypeError('Invalid target-path response.');
    return result;
  },
  saveDraft: async (input: PlanariaSaveDraftInput) => {
    const result: unknown = await ipcRenderer.invoke(PRELOAD_PLANARIA_CHANNELS.saveDraft, input);
    if (!isPlanariaSaveDraftResult(result)) throw new TypeError('Invalid Planaria draft response.');
    return result;
  },
  uploadPackage: (input: PlanariaPackageUploadInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.uploadPackage, input),
  uploadModMedia: (input: PlanariaModMediaUploadInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.uploadModMedia, input),
  uploadBillboard: (input: PlanariaBillboardUploadInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.uploadBillboard, input),
  transitionVersion: (input: PlanariaTransitionInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.transitionVersion, input),
  mutateBillboard: (input: PlanariaBillboardMutationInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.mutateBillboard, input),
  createAdmin: (input: PlanariaCreateAdminInput) => invokePlanariaVoid(PRELOAD_PLANARIA_CHANNELS.createAdmin, input),
  onUploadProgress: (listener: (progress: PlanariaUploadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isPlanariaUploadProgress(value)) listener(value);
    };
    ipcRenderer.on(PRELOAD_PLANARIA_CHANNELS.uploadProgress, handler);
    return () => ipcRenderer.removeListener(PRELOAD_PLANARIA_CHANNELS.uploadProgress, handler);
  },
});

contextBridge.exposeInMainWorld('windowControls', windowControls);
contextBridge.exposeInMainWorld('lyorUpdater', lyorUpdater);
contextBridge.exposeInMainWorld('lyorAuth', lyorAuth);
contextBridge.exposeInMainWorld('planariaAuth', planariaAuth);
contextBridge.exposeInMainWorld('lyorCloudSync', lyorCloudSync);
contextBridge.exposeInMainWorld('lyorInstallationEngine', lyorInstallationEngine);
contextBridge.exposeInMainWorld('lyorPlanaria', lyorPlanaria);
