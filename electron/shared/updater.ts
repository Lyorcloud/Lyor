export const UPDATER_CHANNELS = {
  getState: 'updater:get-state',
  checkForUpdates: 'updater:check-for-updates',
  downloadUpdate: 'updater:download-update',
  restartAndInstall: 'updater:restart-and-install',
  getAutoCheckEnabled: 'updater:get-auto-check-enabled',
  setAutoCheckEnabled: 'updater:set-auto-check-enabled',
  stateChanged: 'updater:state-changed',
} as const;

export type UpdaterInvokeChannel = Exclude<
  (typeof UPDATER_CHANNELS)[keyof typeof UPDATER_CHANNELS],
  typeof UPDATER_CHANNELS.stateChanged
>;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'updateAvailable'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'error';

export type UpdateErrorCode =
  | 'updatesUnavailableInDevelopment'
  | 'updateConfigurationMissing'
  | 'networkUnavailable'
  | 'checkFailed'
  | 'downloadFailed'
  | 'installNotReady';

export interface UpdateProgress {
  readonly percent: number;
  readonly transferred: number;
  readonly total: number;
  readonly bytesPerSecond: number;
}

export interface UpdateError {
  readonly code: UpdateErrorCode;
  readonly message: string;
}

export interface UpdateState {
  readonly status: UpdateStatus;
  readonly currentVersion: string;
  readonly availableVersion: string | null;
  readonly progress: UpdateProgress | null;
  readonly releaseDate: string | null;
  readonly releaseNotes: string | null;
  readonly lastCheckedAt: string | null;
  readonly error: UpdateError | null;
}

export type UpdateStateListener = (state: UpdateState) => void;

export interface LyorUpdaterApi {
  getState: () => Promise<UpdateState>;
  checkForUpdates: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<UpdateState>;
  restartAndInstall: () => Promise<boolean>;
  getAutoCheckEnabled: () => Promise<boolean>;
  setAutoCheckEnabled: (enabled: boolean) => Promise<boolean>;
  onStateChange: (listener: UpdateStateListener) => () => void;
}
