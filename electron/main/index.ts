import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  session,
} from 'electron';

import {
  AUTH_CHANNELS,
  type AuthInvokeChannel,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type UpdatePasswordInput,
} from '../shared/auth';
import {
  CLOUD_SYNC_CHANNELS,
  type CloudSettingsInput,
  type CloudSyncInvokeChannel,
  type DeviceSummaryInput,
  type FavoriteMutationInput,
  type LibraryRemoveInput,
  type LibraryUpsertInput,
  type SyncEventInput,
} from '../shared/cloud-sync';
import {
  INSTALLATION_ENGINE_CHANNELS,
  type InstallationEngineInvokeChannel,
  type InstallationTarget,
  type UninstallTarget,
} from '../shared/installation-engine';
import {
  PLANARIA_CHANNELS,
  type PlanariaBillboardMutationInput,
  type PlanariaBillboardUploadInput,
  type PlanariaCreateAdminInput,
  type PlanariaFilePurpose,
  type PlanariaInvokeChannel,
  type PlanariaModMediaUploadInput,
  type PlanariaContentUploadInput,
  type PlanariaSaveDraftInput,
  type PlanariaTransitionInput,
} from '../shared/planaria';
import {
  PLANARIA_AUTH_CHANNELS,
  type PlanariaAuthInvokeChannel,
} from '../shared/planaria-auth';

import {
  WINDOW_CONTROL_CHANNELS,
  type WindowControlChannel,
} from '../shared/window-controls';
import {
  UPDATER_CHANNELS,
  type UpdaterInvokeChannel,
} from '../shared/updater';
import { UpdateService } from './update-service';
import { AuthService, getAuthDeepLinkFromArguments } from './auth-service';
import { CloudSyncService } from './cloud-sync-service';
import { InstallationEngineService } from './installation-engine/service';
import { PlanariaService } from './planaria-service';

const DEFAULT_DEV_SERVER_URL = 'http://127.0.0.1:5173';
const ALLOWED_WINDOW_CONTROL_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(WINDOW_CONTROL_CHANNELS),
);
const ALLOWED_UPDATER_INVOKE_CHANNELS: ReadonlySet<string> = new Set([
  UPDATER_CHANNELS.getState,
  UPDATER_CHANNELS.checkForUpdates,
  UPDATER_CHANNELS.downloadUpdate,
  UPDATER_CHANNELS.restartAndInstall,
  UPDATER_CHANNELS.getAutoCheckEnabled,
  UPDATER_CHANNELS.setAutoCheckEnabled,
]);
const ALLOWED_AUTH_INVOKE_CHANNELS: ReadonlySet<string> = new Set([
  AUTH_CHANNELS.getState,
  AUTH_CHANNELS.register,
  AUTH_CHANNELS.login,
  AUTH_CHANNELS.forgotPassword,
  AUTH_CHANNELS.updatePassword,
  AUTH_CHANNELS.refreshSession,
  AUTH_CHANNELS.logout,
]);
const ALLOWED_PLANARIA_AUTH_CHANNELS: ReadonlySet<string> = new Set([
  PLANARIA_AUTH_CHANNELS.getState,
  PLANARIA_AUTH_CHANNELS.login,
  PLANARIA_AUTH_CHANNELS.logout,
]);
const ALLOWED_CLOUD_SYNC_INVOKE_CHANNELS: ReadonlySet<string> = new Set([
  CLOUD_SYNC_CHANNELS.getState, CLOUD_SYNC_CHANNELS.bootstrap,
  CLOUD_SYNC_CHANNELS.updateSettings, CLOUD_SYNC_CHANNELS.setFavorite,
  CLOUD_SYNC_CHANNELS.upsertLibrary, CLOUD_SYNC_CHANNELS.removeLibrary,
  CLOUD_SYNC_CHANNELS.updateDeviceSummary, CLOUD_SYNC_CHANNELS.recordEvent,
  CLOUD_SYNC_CHANNELS.retryPending,
]);
const ALLOWED_INSTALLATION_ENGINE_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(INSTALLATION_ENGINE_CHANNELS),
);
const ALLOWED_PLANARIA_CHANNELS: ReadonlySet<string> = new Set([
  PLANARIA_CHANNELS.getDashboard, PLANARIA_CHANNELS.getPublicBillboards,
  PLANARIA_CHANNELS.selectFile, PLANARIA_CHANNELS.selectTargetPath, PLANARIA_CHANNELS.saveDraft,
  PLANARIA_CHANNELS.selectModContent, PLANARIA_CHANNELS.uploadModContent, PLANARIA_CHANNELS.uploadModMedia,
  PLANARIA_CHANNELS.uploadBillboard, PLANARIA_CHANNELS.transitionVersion,
  PLANARIA_CHANNELS.mutateBillboard, PLANARIA_CHANNELS.createAdmin,
]);

let mainWindow: BrowserWindow | null = null;
let updateService: UpdateService | null = null;
let authService: AuthService | null = null;
let planariaAuthService: AuthService | null = null;
let cloudSyncService: CloudSyncService | null = null;
let installationEngineService: InstallationEngineService | null = null;
let planariaService: PlanariaService | null = null;
let pendingAuthDeepLink = getAuthDeepLinkFromArguments(process.argv);

const getProductionRendererPath = (): string =>
  join(__dirname, '..', '..', 'dist', 'index.html');

const getApplicationIconPath = (): string =>
  app.isPackaged
    ? join(__dirname, '..', '..', 'dist', 'assets', 'lyor', 'app-logo.png')
    : join(app.getAppPath(), 'public', 'assets', 'lyor', 'app-logo.png');

const getDevServerUrl = (): URL | null => {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) {
    return null;
  }

  const url = new URL(process.env.VITE_DEV_SERVER_URL);
  const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';

  if (url.protocol !== 'http:' || !isLoopback || url.username || url.password) {
    throw new Error('VITE_DEV_SERVER_URL must be an uncredentialed loopback HTTP URL.');
  }

  return url;
};

const getTrustedRendererUrl = (devServerUrl: URL | null): URL =>
  devServerUrl ?? pathToFileURL(getProductionRendererPath());

const isTrustedRendererUrl = (candidateUrl: string, trustedUrl: URL): boolean => {
  try {
    const candidate = new URL(candidateUrl);

    candidate.hash = '';
    candidate.search = '';

    const normalizedTrustedUrl = new URL(trustedUrl);
    normalizedTrustedUrl.hash = '';
    normalizedTrustedUrl.search = '';

    return candidate.href === normalizedTrustedUrl.href;
  } catch {
    return false;
  }
};

function assertAllowedChannel(
  channel: string,
): asserts channel is WindowControlChannel {
  if (!ALLOWED_WINDOW_CONTROL_CHANNELS.has(channel)) {
    throw new Error('Rejected window-control channel.');
  }
}

function assertAllowedUpdaterChannel(
  channel: string,
): asserts channel is UpdaterInvokeChannel {
  if (!ALLOWED_UPDATER_INVOKE_CHANNELS.has(channel)) {
    throw new Error('Rejected updater channel.');
  }
}

function assertAllowedAuthChannel(
  channel: string,
): asserts channel is AuthInvokeChannel {
  if (!ALLOWED_AUTH_INVOKE_CHANNELS.has(channel)) {
    throw new Error('Rejected auth channel.');
  }
}

function assertAllowedCloudSyncChannel(channel: string): asserts channel is CloudSyncInvokeChannel {
  if (!ALLOWED_CLOUD_SYNC_INVOKE_CHANNELS.has(channel)) throw new Error('Rejected cloud-sync channel.');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
};

const isBoundedString = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length <= maximum;

const isRegisterInput = (value: unknown): value is RegisterInput =>
  isRecord(value) &&
  hasExactKeys(value, ['email', 'password', 'passwordConfirm']) &&
  isBoundedString(value.email, 254) &&
  isBoundedString(value.password, 128) &&
  isBoundedString(value.passwordConfirm, 128);

const isLoginInput = (value: unknown): value is LoginInput =>
  isRecord(value) &&
  hasExactKeys(value, ['email', 'password']) &&
  isBoundedString(value.email, 254) &&
  isBoundedString(value.password, 128);

const isForgotPasswordInput = (value: unknown): value is ForgotPasswordInput =>
  isRecord(value) &&
  hasExactKeys(value, ['email']) &&
  isBoundedString(value.email, 254);

const isUpdatePasswordInput = (value: unknown): value is UpdatePasswordInput =>
  isRecord(value) &&
  hasExactKeys(value, ['password', 'passwordConfirm']) &&
  isBoundedString(value.password, 128) &&
  isBoundedString(value.passwordConfirm, 128);

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isModIdInput = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 120 && /^[a-z0-9-]+$/u.test(value);
const isCloudSettingsInput = (value: unknown): value is CloudSettingsInput =>
  isRecord(value) && hasExactKeys(value, ['theme', 'locale', 'accountPreferences', 'baseUpdatedAt']) &&
  ['ice-max', 'dark', 'light'].includes(String(value.theme)) && ['en', 'tr'].includes(String(value.locale)) &&
  (value.baseUpdatedAt === null || isIsoDate(value.baseUpdatedAt)) && isRecord(value.accountPreferences) &&
  hasExactKeys(value.accountPreferences, ['autoDetectGames']) && typeof value.accountPreferences.autoDetectGames === 'boolean';
const isFavoriteMutationInput = (value: unknown): value is FavoriteMutationInput =>
  isRecord(value) && hasExactKeys(value, ['modId', 'favorite']) && isModIdInput(value.modId) && typeof value.favorite === 'boolean';
const isLibraryUpsertInput = (value: unknown): value is LibraryUpsertInput =>
  isRecord(value) && hasExactKeys(value, ['modId', 'installedAt', 'installedVersion']) && isModIdInput(value.modId) &&
  isIsoDate(value.installedAt) && (value.installedVersion === null || isBoundedString(value.installedVersion, 80));
const isLibraryRemoveInput = (value: unknown): value is LibraryRemoveInput =>
  isRecord(value) && hasExactKeys(value, ['modId']) && isModIdInput(value.modId);
const isDeviceSummaryInput = (value: unknown): value is DeviceSummaryInput =>
  isRecord(value) && hasExactKeys(value, ['modId', 'state', 'installedVersion', 'observedAt']) && isModIdInput(value.modId) &&
  ['installed', 'not_installed', 'unknown', 'needs_attention'].includes(String(value.state)) &&
  (value.installedVersion === null || isBoundedString(value.installedVersion, 80)) && isIsoDate(value.observedAt);
const isSyncEventInput = (value: unknown): value is SyncEventInput => {
  if (!isRecord(value) || !hasExactKeys(value, ['name', 'metadata']) ||
      !isBoundedString(value.name, 80) || value.name.length === 0 || !isRecord(value.metadata)) return false;
  if (JSON.stringify(value.metadata).length > 2048) return false;
  return Object.values(value.metadata).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
};
const isSafeEngineId = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= 120 && /^[a-zA-Z0-9_-]+$/u.test(value);
const isInstallationTarget = (value: unknown): value is InstallationTarget =>
  isRecord(value) && hasExactKeys(value, ['gameDetectionId', 'packageInputId']) &&
  isSafeEngineId(value.gameDetectionId) && isSafeEngineId(value.packageInputId);
const isUninstallTarget = (value: unknown): value is UninstallTarget =>
  isRecord(value) && hasExactKeys(value, ['gameDetectionId', 'modId']) &&
  isSafeEngineId(value.gameDetectionId) && isModIdInput(value.modId);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(value);
const isPlanariaFilePurpose = (value: unknown): value is PlanariaFilePurpose =>
  value === 'mod-content' || value === 'mod-image' || value === 'billboard';
const isPlanariaSaveDraftInput = (value: unknown): value is PlanariaSaveDraftInput =>
  isRecord(value) && hasExactKeys(value, [
    'modId', 'name', 'summary', 'gameId', 'versionId', 'version', 'gameEdition',
    'gameVersionRange', 'manifestSchemaVersion', 'manifest', 'adapterId', 'expectedUpdatedAt',
  ]) && isModIdInput(value.modId) && isBoundedString(value.name, 160) && value.name.length >= 1 &&
  isBoundedString(value.summary, 2000) && isModIdInput(value.gameId) &&
  (value.versionId === null || isUuid(value.versionId)) && isBoundedString(value.version, 80) && value.version.length >= 1 &&
  ['legacy', 'enhanced', 'standard'].includes(String(value.gameEdition)) &&
  (value.gameVersionRange === null || (isBoundedString(value.gameVersionRange, 80) && value.gameVersionRange.length >= 1)) &&
  (value.manifestSchemaVersion === 1 || value.manifestSchemaVersion === 2) && isRecord(value.manifest) &&
  JSON.stringify(value.manifest).length <= 65536 &&
  (value.adapterId === 'generic-files' || value.adapterId === 'synthetic-container-fixture') &&
  (value.expectedUpdatedAt === null || isIsoDate(value.expectedUpdatedAt));
const isPlanariaContentUploadInput = (value: unknown): value is PlanariaContentUploadInput =>
  isRecord(value) && hasExactKeys(value, ['selectionId', 'versionId', 'modId', 'version']) &&
  isUuid(value.selectionId) && isUuid(value.versionId) && isModIdInput(value.modId) &&
  isBoundedString(value.version, 80) && value.version.length >= 1;
const isPlanariaModMediaUploadInput = (value: unknown): value is PlanariaModMediaUploadInput =>
  isRecord(value) && hasExactKeys(value, ['selectionId', 'modId']) &&
  isUuid(value.selectionId) && isModIdInput(value.modId);
const isPlanariaBillboardUploadInput = (value: unknown): value is PlanariaBillboardUploadInput =>
  isRecord(value) && hasExactKeys(value, ['selectionId', 'alt']) && isUuid(value.selectionId) &&
  isBoundedString(value.alt, 240) && value.alt.length >= 1;
const isPlanariaTransitionInput = (value: unknown): value is PlanariaTransitionInput =>
  isRecord(value) && hasExactKeys(value, ['action', 'versionId', 'expectedUpdatedAt']) &&
  ['ready', 'publish', 'disable'].includes(String(value.action)) && isUuid(value.versionId) &&
  isIsoDate(value.expectedUpdatedAt);
const isPlanariaBillboardMutationInput = (value: unknown): value is PlanariaBillboardMutationInput => {
  if (!isRecord(value) || !isUuid(value.billboardId)) return false;
  if (value.action === 'move') return hasExactKeys(value, ['action', 'billboardId', 'expectedRevision', 'direction']) &&
    Number.isInteger(value.expectedRevision) && Number(value.expectedRevision) > 0 && (value.direction === -1 || value.direction === 1);
  if (value.action === 'publish' || value.action === 'disable') return hasExactKeys(value, ['action', 'billboardId', 'expectedRevision']) &&
    Number.isInteger(value.expectedRevision) && Number(value.expectedRevision) > 0;
  return value.action === 'delete' && hasExactKeys(value, ['action', 'billboardId']);
};
const isPlanariaCreateAdminInput = (value: unknown): value is PlanariaCreateAdminInput =>
  isRecord(value) && hasExactKeys(value, ['email', 'username', 'password']) &&
  isBoundedString(value.email, 254) && value.email.length >= 3 && isBoundedString(value.username, 64) &&
  value.username.length >= 3 && isBoundedString(value.password, 128) && value.password.length >= 12;

const assertTrustedIpcSender = (
  event: IpcMainInvokeEvent,
  window: BrowserWindow,
  trustedRendererUrl: URL,
): void => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const isMainFrame = event.senderFrame === event.sender.mainFrame;

  if (
    window.isDestroyed() ||
    event.sender.isDestroyed() ||
    senderWindow !== window ||
    !isMainFrame ||
    !isTrustedRendererUrl(event.senderFrame.url, trustedRendererUrl)
  ) {
    throw new Error('Rejected untrusted IPC sender.');
  }
};

const registerWindowControlHandler = <Result>(
  window: BrowserWindow,
  trustedRendererUrl: URL,
  channel: WindowControlChannel,
  action: () => Result,
): void => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertAllowedChannel(channel);
    assertTrustedIpcSender(event, window, trustedRendererUrl);

    if (args.length !== 0) {
      throw new Error('Window-control channels do not accept arguments.');
    }

    return action();
  });
};

const registerWindowControlHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
): void => {
  registerWindowControlHandler(
    window,
    trustedRendererUrl,
    WINDOW_CONTROL_CHANNELS.minimize,
    () => {
      window.minimize();
    },
  );

  registerWindowControlHandler(
    window,
    trustedRendererUrl,
    WINDOW_CONTROL_CHANNELS.maximize,
    () => {
      window.maximize();
    },
  );

  registerWindowControlHandler(
    window,
    trustedRendererUrl,
    WINDOW_CONTROL_CHANNELS.close,
    () => {
      setImmediate(() => {
        if (!window.isDestroyed()) {
          window.close();
        }
      });
    },
  );

  registerWindowControlHandler(
    window,
    trustedRendererUrl,
    WINDOW_CONTROL_CHANNELS.getMaximized,
    () => window.isMaximized(),
  );

  registerWindowControlHandler(
    window,
    trustedRendererUrl,
    WINDOW_CONTROL_CHANNELS.toggle,
    () => {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }

      return window.isMaximized();
    },
  );
};

const registerUpdaterHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: UpdateService,
): void => {
  const registerHandler = (
    channel: UpdaterInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertAllowedUpdaterChannel(channel);
      assertTrustedIpcSender(event, window, trustedRendererUrl);

      if (args.length !== expectedArgumentCount) {
        throw new Error('Rejected invalid updater arguments.');
      }

      return action(...args);
    });
  };

  registerHandler(UPDATER_CHANNELS.getState, 0, () => service.getState());
  registerHandler(UPDATER_CHANNELS.checkForUpdates, 0, () =>
    service.checkForUpdates(),
  );
  registerHandler(UPDATER_CHANNELS.downloadUpdate, 0, () =>
    service.downloadUpdate(),
  );
  registerHandler(UPDATER_CHANNELS.restartAndInstall, 0, () =>
    service.restartAndInstall(),
  );
  registerHandler(UPDATER_CHANNELS.getAutoCheckEnabled, 0, () =>
    service.getAutoCheckEnabled(),
  );
  registerHandler(UPDATER_CHANNELS.setAutoCheckEnabled, 1, (enabled) => {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('Auto-update preference must be a boolean.');
    }

    return service.setAutoCheckEnabled(enabled);
  });
};

const registerAuthHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: AuthService,
): void => {
  const registerHandler = (
    channel: AuthInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertAllowedAuthChannel(channel);
      assertTrustedIpcSender(event, window, trustedRendererUrl);
      if (args.length !== expectedArgumentCount) {
        throw new Error('Rejected invalid auth arguments.');
      }
      return action(...args);
    });
  };

  registerHandler(AUTH_CHANNELS.getState, 0, () => service.getState());
  registerHandler(AUTH_CHANNELS.register, 1, (input) => {
    if (!isRegisterInput(input)) throw new TypeError('Rejected registration input.');
    return service.register(input);
  });
  registerHandler(AUTH_CHANNELS.login, 1, (input) => {
    if (!isLoginInput(input)) throw new TypeError('Rejected login input.');
    return service.login(input);
  });
  registerHandler(AUTH_CHANNELS.forgotPassword, 1, (input) => {
    if (!isForgotPasswordInput(input)) throw new TypeError('Rejected password reset input.');
    return service.forgotPassword(input);
  });
  registerHandler(AUTH_CHANNELS.updatePassword, 1, (input) => {
    if (!isUpdatePasswordInput(input)) throw new TypeError('Rejected password update input.');
    return service.updatePassword(input);
  });
  registerHandler(AUTH_CHANNELS.refreshSession, 0, () => service.refreshSession());
  registerHandler(AUTH_CHANNELS.logout, 0, () => service.logout());
};

const registerPlanariaAuthHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: AuthService,
): void => {
  const registerHandler = (
    channel: PlanariaAuthInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!ALLOWED_PLANARIA_AUTH_CHANNELS.has(channel)) throw new Error('Rejected Planaria auth channel.');
      assertTrustedIpcSender(event, window, trustedRendererUrl);
      if (args.length !== expectedArgumentCount) throw new Error('Rejected Planaria auth arguments.');
      return action(...args);
    });
  };

  registerHandler(PLANARIA_AUTH_CHANNELS.getState, 0, () => service.getState());
  registerHandler(PLANARIA_AUTH_CHANNELS.login, 1, (input) => {
    if (!isLoginInput(input)) throw new TypeError('Rejected Planaria login input.');
    return service.login(input);
  });
  registerHandler(PLANARIA_AUTH_CHANNELS.logout, 0, () => service.logout());
};

const registerCloudSyncHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: CloudSyncService,
): void => {
  const registerHandler = (
    channel: CloudSyncInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      assertAllowedCloudSyncChannel(channel);
      assertTrustedIpcSender(event, window, trustedRendererUrl);
      if (args.length !== expectedArgumentCount) throw new Error('Rejected invalid cloud-sync arguments.');
      return action(...args);
    });
  };
  registerHandler(CLOUD_SYNC_CHANNELS.getState, 0, () => service.getState());
  registerHandler(CLOUD_SYNC_CHANNELS.bootstrap, 0, () => service.bootstrap());
  registerHandler(CLOUD_SYNC_CHANNELS.retryPending, 0, () => service.retryPending());
  registerHandler(CLOUD_SYNC_CHANNELS.updateSettings, 1, (input) => {
    if (!isCloudSettingsInput(input)) throw new TypeError('Rejected cloud settings input.');
    return service.updateSettings(input);
  });
  registerHandler(CLOUD_SYNC_CHANNELS.setFavorite, 1, (input) => {
    if (!isFavoriteMutationInput(input)) throw new TypeError('Rejected favorite input.');
    return service.setFavorite(input);
  });
  registerHandler(CLOUD_SYNC_CHANNELS.upsertLibrary, 1, (input) => {
    if (!isLibraryUpsertInput(input)) throw new TypeError('Rejected library input.');
    return service.upsertLibrary(input);
  });
  registerHandler(CLOUD_SYNC_CHANNELS.removeLibrary, 1, (input) => {
    if (!isLibraryRemoveInput(input)) throw new TypeError('Rejected library input.');
    return service.removeLibrary(input);
  });
  registerHandler(CLOUD_SYNC_CHANNELS.updateDeviceSummary, 1, (input) => {
    if (!isDeviceSummaryInput(input)) throw new TypeError('Rejected device summary input.');
    return service.updateDeviceSummary(input);
  });
  registerHandler(CLOUD_SYNC_CHANNELS.recordEvent, 1, (input) => {
    if (!isSyncEventInput(input)) throw new TypeError('Rejected sync event input.');
    return service.recordEvent(input);
  });
};

const registerInstallationEngineHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: InstallationEngineService,
): void => {
  const registerHandler = (
    channel: InstallationEngineInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!ALLOWED_INSTALLATION_ENGINE_CHANNELS.has(channel)) throw new Error('Rejected installation-engine channel.');
      assertTrustedIpcSender(event, window, trustedRendererUrl);
      if (args.length !== expectedArgumentCount) throw new Error('Rejected installation-engine arguments.');
      return action(...args);
    });
  };
  registerHandler(INSTALLATION_ENGINE_CHANNELS.getState, 0, () => service.getState());
  registerHandler(INSTALLATION_ENGINE_CHANNELS.install, 1, (input) => {
    if (!isInstallationTarget(input)) throw new TypeError('Rejected installation request.');
    return service.install(input);
  });
  registerHandler(INSTALLATION_ENGINE_CHANNELS.uninstall, 1, (input) => {
    if (!isUninstallTarget(input)) throw new TypeError('Rejected uninstall request.');
    return service.uninstall(input);
  });
};

const registerPlanariaHandlers = (
  window: BrowserWindow,
  trustedRendererUrl: URL,
  service: PlanariaService,
): void => {
  const registerHandler = (
    channel: PlanariaInvokeChannel,
    expectedArgumentCount: number,
    action: (...args: readonly unknown[]) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!ALLOWED_PLANARIA_CHANNELS.has(channel)) throw new Error('Rejected Planaria channel.');
      assertTrustedIpcSender(event, window, trustedRendererUrl);
      if (args.length !== expectedArgumentCount) throw new Error('Rejected Planaria arguments.');
      return action(...args);
    });
  };
  registerHandler(PLANARIA_CHANNELS.getDashboard, 0, () => service.getDashboard());
  registerHandler(PLANARIA_CHANNELS.getPublicBillboards, 0, () => service.getPublicBillboards());
  registerHandler(PLANARIA_CHANNELS.selectFile, 1, (purpose) => {
    if (!isPlanariaFilePurpose(purpose)) throw new TypeError('Rejected Planaria file purpose.');
    return service.selectFile(window, purpose);
  });
  registerHandler(PLANARIA_CHANNELS.selectModContent, 1, (kind) => {
    if (kind !== 'file' && kind !== 'folder') throw new TypeError('Rejected mod content kind.');
    return service.selectModContent(window, kind);
  });
  registerHandler(PLANARIA_CHANNELS.selectTargetPath, 0, () => service.selectTargetPath(window));
  registerHandler(PLANARIA_CHANNELS.saveDraft, 1, (input) => {
    if (!isPlanariaSaveDraftInput(input)) throw new TypeError('Rejected Planaria draft.');
    return service.saveDraft(input);
  });
  registerHandler(PLANARIA_CHANNELS.uploadModContent, 1, (input) => {
    if (!isPlanariaContentUploadInput(input)) throw new TypeError('Rejected Planaria content upload.');
    return service.uploadModContent(input);
  });
  registerHandler(PLANARIA_CHANNELS.uploadModMedia, 1, (input) => {
    if (!isPlanariaModMediaUploadInput(input)) throw new TypeError('Rejected Planaria media upload.');
    return service.uploadModMedia(input);
  });
  registerHandler(PLANARIA_CHANNELS.uploadBillboard, 1, (input) => {
    if (!isPlanariaBillboardUploadInput(input)) throw new TypeError('Rejected Planaria billboard upload.');
    return service.uploadBillboard(input);
  });
  registerHandler(PLANARIA_CHANNELS.transitionVersion, 1, (input) => {
    if (!isPlanariaTransitionInput(input)) throw new TypeError('Rejected Planaria lifecycle transition.');
    return service.transitionVersion(input);
  });
  registerHandler(PLANARIA_CHANNELS.mutateBillboard, 1, (input) => {
    if (!isPlanariaBillboardMutationInput(input)) throw new TypeError('Rejected Planaria billboard mutation.');
    return service.mutateBillboard(input);
  });
  registerHandler(PLANARIA_CHANNELS.createAdmin, 1, (input) => {
    if (!isPlanariaCreateAdminInput(input)) throw new TypeError('Rejected Planaria admin account.');
    return service.createAdmin(input);
  });
};

const createMainWindow = async (
  service: UpdateService,
  authentication: AuthService,
  planariaAuthentication: AuthService,
  cloudSync: CloudSyncService,
  installationEngine: InstallationEngineService,
  planaria: PlanariaService,
): Promise<BrowserWindow> => {
  const devServerUrl = getDevServerUrl();
  const trustedRendererUrl = getTrustedRendererUrl(devServerUrl);
  const window = new BrowserWindow({
    width: 1440,
    height: 800,
    minWidth: 520,
    minHeight: 480,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#5E8CFF',
    icon: getApplicationIconPath(),
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      webviewTag: false,
    },
  });

  registerWindowControlHandlers(window, trustedRendererUrl);
  registerUpdaterHandlers(window, trustedRendererUrl, service);
  registerAuthHandlers(window, trustedRendererUrl, authentication);
  registerPlanariaAuthHandlers(window, trustedRendererUrl, planariaAuthentication);
  registerCloudSyncHandlers(window, trustedRendererUrl, cloudSync);
  registerInstallationEngineHandlers(window, trustedRendererUrl, installationEngine);
  registerPlanariaHandlers(window, trustedRendererUrl, planaria);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl.href || DEFAULT_DEV_SERVER_URL);
  } else {
    await window.loadFile(getProductionRendererPath());
  }

  return window;
};

const configureSessionSecurity = (): void => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    contents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    contents.on('will-redirect', (event) => {
      event.preventDefault();
    });
  });

  app.on('second-instance', (_event, commandLine) => {
    const authDeepLink = getAuthDeepLinkFromArguments(commandLine);
    if (authDeepLink && authService) {
      void authService.handleDeepLink(authDeepLink);
    } else if (authDeepLink) {
      pendingAuthDeepLink = authDeepLink;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    configureSessionSecurity();
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient('lyor', process.execPath, [join(process.cwd(), process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('lyor');
    }
    updateService = new UpdateService({
      emitState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(UPDATER_CHANNELS.stateChanged, state);
        }
      },
    });
    authService = new AuthService({
      emitState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(AUTH_CHANNELS.stateChanged, state);
        }
        if (state.status === 'authenticated') void cloudSyncService?.bootstrap();
        else cloudSyncService?.signOut();
      },
    });
    planariaAuthService = new AuthService({
      sessionPath: join(app.getPath('userData'), 'planaria-auth', 'session.bin'),
      sessionStorageKey: 'lyor.planaria.supabase.session',
      emitState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(PLANARIA_AUTH_CHANNELS.stateChanged, state);
        }
      },
    });
    cloudSyncService = await CloudSyncService.create(authService, (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CLOUD_SYNC_CHANNELS.stateChanged, state);
      }
    });
    installationEngineService = new InstallationEngineService(join(app.getPath('userData'), 'installation-engine'));
    planariaService = new PlanariaService({
      auth: planariaAuthService,
      journalPath: join(app.getPath('userData'), 'planaria', 'upload-journal.json'),
      emitProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(PLANARIA_CHANNELS.uploadProgress, progress);
        }
      },
    });
    await authService.restoreSession();
    await planariaAuthService.restoreSession();
    if (pendingAuthDeepLink) {
      const deepLink = pendingAuthDeepLink;
      pendingAuthDeepLink = null;
      await authService.handleDeepLink(deepLink);
    }
    mainWindow = await createMainWindow(updateService, authService, planariaAuthService, cloudSyncService, installationEngineService, planariaService);
    updateService.scheduleAutomaticCheck();

    app.on('activate', () => {
      if (!mainWindow && updateService && authService && planariaAuthService && cloudSyncService && installationEngineService && planariaService) {
        void createMainWindow(updateService, authService, planariaAuthService, cloudSyncService, installationEngineService, planariaService).then((window) => {
          mainWindow = window;
        });
      }
    });
  });

  app.on('window-all-closed', () => {
    if (!updateService?.isInstallRequested()) {
      app.quit();
    }
  });
}
