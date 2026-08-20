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
  UpdateErrorCode,
  UpdateProgress,
  UpdateState,
} from '../shared/updater';
import { UpdatePreferences } from './update-preferences';

const AUTOMATIC_CHECK_DELAY_MS = 7_000;
const MAX_LOG_MESSAGE_LENGTH = 1_000;
const MAX_RELEASE_NOTES_INPUT_LENGTH = 4_000;
const MAX_RELEASE_NOTES_LENGTH = 600;

type UpdateAction = 'check' | 'download';

interface UpdateServiceOptions {
  readonly emitState: (state: UpdateState) => void;
}

const sanitizeLogMessage = (message: unknown): string => {
  if (message instanceof Error) {
    return sanitizeLogMessage(`${message.name}: ${message.message}`);
  }

  if (typeof message !== 'string') {
    return '[updater details omitted]';
  }

  return message
    .replace(/https?:\/\/\S+/giu, '[update-url]')
    .replace(
      /\b[a-z]:\\(?:[^\\/:*?"<>|'\r\n]+\\)*[^\\/:*?"<>|'\r\n]*/giu,
      '[local-path]',
    )
    .replace(/\\\\[^\\\s'"]+\\[^'"\r\n]*/gu, '[local-path]')
    .replace(/\b\/(?:users|home|tmp|var)\/[^\s'"]+/giu, '[local-path]')
    .replace(
      /\b(authorization|cookie|password|secret|token)\s*[:=]\s*\S+/giu,
      '$1=[redacted]',
    )
    .replace(/\b(?:ghp|github_pat)_[a-z0-9_]+\b/giu, '[redacted-token]')
    .slice(0, MAX_LOG_MESSAGE_LENGTH);
};

const updateLogger = {
  info: (message?: unknown): void => {
    log.info(`[updater] ${sanitizeLogMessage(message)}`);
  },
  warn: (message?: unknown): void => {
    log.warn(`[updater] ${sanitizeLogMessage(message)}`);
  },
  error: (message?: unknown): void => {
    log.error(`[updater] ${sanitizeLogMessage(message)}`);
  },
  debug: (message: string): void => {
    log.debug(`[updater] ${sanitizeLogMessage(message)}`);
  },
};

const normalizeVersion = (version: unknown): string | null => {
  if (typeof version !== 'string') {
    return null;
  }

  const normalized = version.trim();
  return /^[0-9a-z][0-9a-z.+-]{0,63}$/iu.test(normalized)
    ? normalized
    : null;
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

const classifyError = (
  error: unknown,
  action: UpdateAction,
): UpdateError => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('app-update.yml') ||
    normalized.includes('update config') ||
    normalized.includes('no published versions')
  ) {
    return {
      code: 'updateConfigurationMissing',
      message: 'Updates are not configured for this build.',
    };
  }

  if (
    normalized.includes('enotfound') ||
    normalized.includes('econnrefused') ||
    normalized.includes('econnreset') ||
    normalized.includes('etimedout') ||
    normalized.includes('net::') ||
    normalized.includes('network') ||
    normalized.includes('timeout')
  ) {
    return {
      code: 'networkUnavailable',
      message: 'The update service could not be reached. Try again later.',
    };
  }

  const code: UpdateErrorCode =
    action === 'download' ? 'downloadFailed' : 'checkFailed';

  return {
    code,
    message:
      action === 'download'
        ? 'The update could not be downloaded. Try again later.'
        : 'Updates could not be checked. Try again later.',
  };
};

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
      currentVersion: normalizeVersion(app.getVersion()) ?? '0.0.0',
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
    autoUpdater.autoInstallOnAppQuit = true;
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
        this.setError(classifyError(error, 'check'), true);
      }
      updateLogger.error(
        `Update check failed (${classifyError(error, 'check').code}).`,
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
        this.setError(classifyError(error, 'download'));
      }
      updateLogger.error(
        `Update download failed (${classifyError(error, 'download').code}).`,
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
      const safeError = classifyError(error, action);
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
    this.patchState({
      status,
      availableVersion: isAvailable
        ? normalizeVersion(info?.version) ?? this.state.availableVersion
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
