import { join } from 'node:path';

import { app } from 'electron';
import log from 'electron-log/main';
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from 'electron-updater';

import type {
  UpdateError,
  UpdateProgress,
  UpdateState,
} from '../shared/updater';
import { UpdatePreferences } from './update-preferences';
import {
  classifyUpdateError,
  isStrictVersionUpgrade,
  normalizeUpdateVersion,
  sanitizeUpdateLogMessage,
  type UpdateAction,
} from './update-policy';

const AUTOMATIC_CHECK_DELAY_MS = 7_000;
const MAX_RELEASE_NOTES_INPUT_LENGTH = 4_000;
const MAX_RELEASE_NOTES_LENGTH = 600;

interface UpdateServiceOptions {
  readonly emitState: (state: UpdateState) => void;
}

const updateLogger = {
  info: (message?: unknown): void => {
    log.info(`[updater] ${sanitizeUpdateLogMessage(message)}`);
  },
  warn: (message?: unknown): void => {
    log.warn(`[updater] ${sanitizeUpdateLogMessage(message)}`);
  },
  error: (message?: unknown): void => {
    log.error(`[updater] ${sanitizeUpdateLogMessage(message)}`);
  },
  debug: (message: string): void => {
    log.debug(`[updater] ${sanitizeUpdateLogMessage(message)}`);
  },
};

const normalizeDate = (date: unknown): string | null => {
  if (typeof date !== 'string') {
    return null;
  }

  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const normalizeReleaseNotes = (notes: UpdateInfo['releaseNotes']): string | null => {
  const combined = Array.isArray(notes)
    ? notes
        .map((entry) => entry.note)
        .filter((note): note is string => typeof note === 'string')
        .join('\n')
    : notes;

  if (typeof combined !== 'string') {
    return null;
  }

  const decodedText = combined
    .slice(0, MAX_RELEASE_NOTES_INPUT_LENGTH)
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
  const plainText = [...decodedText]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 9 ||
        codePoint === 10 ||
        codePoint === 13 ||
        (codePoint >= 32 && codePoint !== 127)
      );
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_RELEASE_NOTES_LENGTH);

  return plainText.length > 0 ? plainText : null;
};

const normalizeByteValue = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

const normalizeProgress = (progress: ProgressInfo): UpdateProgress => ({
  percent: Number.isFinite(progress.percent)
    ? Math.min(100, Math.max(0, progress.percent))
    : 0,
  transferred: normalizeByteValue(progress.transferred),
  total: normalizeByteValue(progress.total),
  bytesPerSecond: normalizeByteValue(progress.bytesPerSecond),
});

export class UpdateService {
  private state: UpdateState;
  private readonly preferences: UpdatePreferences;
  private checkPromise: Promise<UpdateState> | null = null;
  private downloadPromise: Promise<UpdateState> | null = null;
  private automaticCheckScheduled = false;
  private sessionHasChecked = false;
  private installRequested = false;

  public constructor(private readonly options: UpdateServiceOptions) {
    log.initialize({ preload: false, spyRendererConsole: false });
    log.transports.ipc.level = false;
    log.transports.remote.level = false;

    this.state = {
      status: 'idle',
      currentVersion: normalizeUpdateVersion(app.getVersion()) ?? '0.0.0',
      availableVersion: null,
      progress: null,
      releaseDate: null,
      releaseNotes: null,
      lastCheckedAt: null,
      error: null,
    };
    this.preferences = new UpdatePreferences(
      join(app.getPath('userData'), 'update-preferences.json'),
      updateLogger.warn,
    );

    if (!app.isPackaged) {
      updateLogger.info('Updater is disabled outside a packaged build.');
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = updateLogger;
    this.registerUpdaterEvents();
    updateLogger.info('Updater initialized for packaged build.');
  }

  public getState(): UpdateState {
    return { ...this.state };
  }

  public async getAutoCheckEnabled(): Promise<boolean> {
    return this.preferences.getAutoCheckEnabled();
  }

  public async setAutoCheckEnabled(enabled: boolean): Promise<boolean> {
    return this.preferences.setAutoCheckEnabled(enabled);
  }

  public scheduleAutomaticCheck(): void {
    if (!app.isPackaged || this.automaticCheckScheduled) {
      return;
    }

    this.automaticCheckScheduled = true;
    const timer = setTimeout(() => {
      void this.runAutomaticCheck();
    }, AUTOMATIC_CHECK_DELAY_MS);
    timer.unref();
  }

  public checkForUpdates(): Promise<UpdateState> {
    if (!app.isPackaged) {
      return Promise.resolve(
        this.setError({
          code: 'updatesUnavailableInDevelopment',
          message: 'Updates can only be checked in an installed production build.',
        }),
      );
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    if (this.state.status === 'downloading' || this.state.status === 'downloaded') {
      return Promise.resolve(this.getState());
    }

    this.sessionHasChecked = true;
    this.checkPromise = this.performCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  public downloadUpdate(): Promise<UpdateState> {
    if (!app.isPackaged) {
      return Promise.resolve(
        this.setError({
          code: 'updatesUnavailableInDevelopment',
          message: 'Updates can only be downloaded in an installed production build.',
        }),
      );
    }

    if (this.downloadPromise) {
      return this.downloadPromise;
    }

    if (this.state.status === 'downloaded') {
      return Promise.resolve(this.getState());
    }

    if (this.state.status !== 'updateAvailable') {
      return Promise.resolve(
        this.setError({
          code: 'downloadFailed',
          message: 'Check for an available update before downloading.',
        }),
      );
    }

    this.downloadPromise = this.performDownload().finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  public async restartAndInstall(): Promise<boolean> {
    if (!app.isPackaged || this.state.status !== 'downloaded') {
      this.setError({
        code: 'installNotReady',
        message: 'The update is not ready to install yet.',
      });
      return false;
    }

    if (this.installRequested) {
      return false;
    }

    this.installRequested = true;
    updateLogger.info('User requested restart and install.');

    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch {
        this.installRequested = false;
        this.setError({
          code: 'installNotReady',
          message: 'The update could not be installed. Try restarting Lyor.',
        });
        updateLogger.error('quitAndInstall failed.');
      }
    });

    return true;
  }

  public isInstallRequested(): boolean {
    return this.installRequested;
  }

  private async runAutomaticCheck(): Promise<void> {
    try {
      if (
        this.sessionHasChecked ||
        !(await this.preferences.getAutoCheckEnabled())
      ) {
        return;
      }

      updateLogger.info('Starting automatic update check.');
      await this.checkForUpdates();
    } catch {
      this.setError({
        code: 'checkFailed',
        message: 'Updates could not be checked. Try again later.',
      });
      updateLogger.error('Automatic update check failed.');
    }
  }

  private async performCheck(): Promise<UpdateState> {
    this.patchState({
      status: 'checking',
      progress: null,
      error: null,
    });

    try {
      const result = await autoUpdater.checkForUpdates();

      if (this.state.status === 'checking') {
        if (result === null) {
          this.setError(
            {
              code: 'updateConfigurationMissing',
              message: 'Updates are not configured for this build.',
            },
            true,
          );
        } else if (result.isUpdateAvailable) {
          this.applyUpdateInfo('updateAvailable', result.updateInfo);
        } else {
          this.applyUpdateInfo('upToDate', result.updateInfo);
        }
      }
    } catch (error: unknown) {
      if (this.state.status !== 'error') {
        this.setError(classifyUpdateError(error, 'check'), true);
      }
      updateLogger.error(
        `Update check failed (${classifyUpdateError(error, 'check').code}).`,
      );
    }

    return this.getState();
  }

  private async performDownload(): Promise<UpdateState> {
    this.patchState({ status: 'downloading', progress: null, error: null });

    try {
      await autoUpdater.downloadUpdate();
    } catch (error: unknown) {
      if (this.state.status !== 'error') {
        this.setError(classifyUpdateError(error, 'download'));
      }
      updateLogger.error(
        `Update download failed (${classifyUpdateError(error, 'download').code}).`,
      );
    }

    return this.getState();
  }

  private registerUpdaterEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.patchState({ status: 'checking', progress: null, error: null });
      updateLogger.info('Event: checking-for-update.');
    });

    autoUpdater.on('update-available', (info) => {
      this.applyUpdateInfo('updateAvailable', info);
      updateLogger.info('Event: update-available.');
    });

    autoUpdater.on('update-not-available', (info) => {
      this.applyUpdateInfo('upToDate', info);
      updateLogger.info('Event: update-not-available.');
    });

    autoUpdater.on('download-progress', (progress) => {
      this.patchState({
        status: 'downloading',
        progress: normalizeProgress(progress),
        error: null,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.applyUpdateInfo('downloaded', info, {
        percent: 100,
        transferred: this.state.progress?.total ?? 0,
        total: this.state.progress?.total ?? 0,
        bytesPerSecond: 0,
      });
      updateLogger.info('Event: update-downloaded.');
    });

    autoUpdater.on('error', (error) => {
      const action: UpdateAction =
        this.state.status === 'downloading' ? 'download' : 'check';
      const safeError = classifyUpdateError(error, action);
      this.setError(safeError, action === 'check');
      updateLogger.error(`Event: error (${safeError.code}).`);
    });
  }

  private applyUpdateInfo(
    status: 'updateAvailable' | 'downloaded' | 'upToDate',
    info: UpdateInfo | null | undefined,
    progress: UpdateProgress | null = null,
  ): void {
    const isAvailable = status !== 'upToDate';
    const normalizedAvailableVersion = normalizeUpdateVersion(info?.version);
    if (isAvailable && (!normalizedAvailableVersion || !isStrictVersionUpgrade(this.state.currentVersion, normalizedAvailableVersion))) {
      if (status === 'downloaded') {
        this.setError({ code: 'updateRejected', message: 'The downloaded update did not pass version policy checks.' });
      } else {
        this.patchState({ status: 'upToDate', availableVersion: null, progress: null, error: null, lastCheckedAt: new Date().toISOString() });
      }
      return;
    }
    this.patchState({
      status,
      availableVersion: isAvailable
        ? normalizedAvailableVersion ?? this.state.availableVersion
        : null,
      releaseDate: isAvailable
        ? normalizeDate(info?.releaseDate) ?? this.state.releaseDate
        : null,
      releaseNotes: isAvailable
        ? normalizeReleaseNotes(info?.releaseNotes) ?? this.state.releaseNotes
        : null,
      progress,
      lastCheckedAt:
        status === 'downloaded'
          ? this.state.lastCheckedAt
          : new Date().toISOString(),
      error: null,
    });
  }

  private setError(error: UpdateError, checked = false): UpdateState {
    return this.patchState({
      status: 'error',
      progress: null,
      error,
      lastCheckedAt: checked ? new Date().toISOString() : this.state.lastCheckedAt,
    });
  }

  private patchState(patch: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.options.emitState(snapshot);
    return snapshot;
  }
}
