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
  WINDOW_CONTROL_CHANNELS,
  type WindowControlChannel,
} from '../shared/window-controls';
import {
  UPDATER_CHANNELS,
  type UpdaterInvokeChannel,
} from '../shared/updater';
import { UpdateService } from './update-service';

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

let mainWindow: BrowserWindow | null = null;
let updateService: UpdateService | null = null;

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

const createMainWindow = async (
  service: UpdateService,
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

  app.on('second-instance', () => {
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
    updateService = new UpdateService({
      emitState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(UPDATER_CHANNELS.stateChanged, state);
        }
      },
    });
    mainWindow = await createMainWindow(updateService);
    updateService.scheduleAutomaticCheck();

    app.on('activate', () => {
      if (!mainWindow && updateService) {
        void createMainWindow(updateService).then((window) => {
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
