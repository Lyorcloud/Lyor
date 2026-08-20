export const CLOUD_SYNC_CHANNELS = {
  getState: 'cloud-sync:get-state',
  bootstrap: 'cloud-sync:bootstrap',
  updateSettings: 'cloud-sync:update-settings',
  setFavorite: 'cloud-sync:set-favorite',
  upsertLibrary: 'cloud-sync:upsert-library',
  removeLibrary: 'cloud-sync:remove-library',
  updateDeviceSummary: 'cloud-sync:update-device-summary',
  recordEvent: 'cloud-sync:record-event',
  retryPending: 'cloud-sync:retry-pending',
  stateChanged: 'cloud-sync:state-changed',
} as const;

export type CloudSyncInvokeChannel =
  (typeof CLOUD_SYNC_CHANNELS)[keyof Omit<typeof CLOUD_SYNC_CHANNELS, 'stateChanged'>];

export type CloudSyncStatus =
  | 'signedOut'
  | 'bootstrapping'
  | 'ready'
  | 'partial'
  | 'offline';
export type BootstrapStep =
  | 'authenticate'
  | 'profile'
  | 'settings'
  | 'favorites'
  | 'library'
  | 'device'
  | 'deviceSummaries'
  | 'home';
export type BootstrapStepStatus = 'pending' | 'loading' | 'ready' | 'failed';

export interface CloudSettings {
  readonly theme: 'ice-max' | 'dark' | 'light';
  readonly locale: 'en' | 'tr';
  readonly accountPreferences: Readonly<{ autoDetectGames: boolean }>;
  readonly updatedAt: string;
}

export interface CloudFavorite {
  readonly modId: string;
  readonly createdAt: string;
}

export interface CloudLibraryEntry {
  readonly modId: string;
  readonly firstInstalledAt: string;
  readonly lastInstalledAt: string;
  readonly lastInstalledVersion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloudDevice {
  readonly id: string;
  readonly name: string;
  readonly os: string;
  readonly architecture: string;
  readonly appVersion: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
}

export type DeviceSummaryState = 'installed' | 'not_installed' | 'unknown' | 'needs_attention';

export interface DeviceInstallationSummary {
  readonly deviceId: string;
  readonly modId: string;
  readonly state: DeviceSummaryState;
  readonly installedVersion: string | null;
  readonly observedAt: string;
  readonly updatedAt: string;
}

export interface CloudAccountCache {
  readonly userId: string;
  readonly profileLoaded: boolean;
  readonly settings: CloudSettings | null;
  readonly favorites: readonly CloudFavorite[];
  readonly library: readonly CloudLibraryEntry[];
  readonly device: CloudDevice | null;
  readonly deviceSummaries: readonly DeviceInstallationSummary[];
  readonly cachedAt: string;
}

export interface CloudSyncError {
  readonly code: 'configurationUnavailable' | 'notAuthenticated' | 'offline' | 'partialFailure' | 'invalidInput';
  readonly message: string;
}

export interface CloudSyncState {
  readonly status: CloudSyncStatus;
  readonly steps: Readonly<Record<BootstrapStep, BootstrapStepStatus>>;
  readonly account: CloudAccountCache | null;
  readonly pendingOperations: number;
  readonly lastSyncedAt: string | null;
  readonly error: CloudSyncError | null;
}

export interface CloudSettingsInput {
  readonly theme: CloudSettings['theme'];
  readonly locale: CloudSettings['locale'];
  readonly accountPreferences: Readonly<{ autoDetectGames: boolean }>;
  readonly baseUpdatedAt: string | null;
}

export interface FavoriteMutationInput {
  readonly modId: string;
  readonly favorite: boolean;
}

export interface LibraryUpsertInput {
  readonly modId: string;
  readonly installedAt: string;
  readonly installedVersion: string | null;
}

export interface LibraryRemoveInput {
  readonly modId: string;
}

export interface DeviceSummaryInput {
  readonly modId: string;
  readonly state: DeviceSummaryState;
  readonly installedVersion: string | null;
  readonly observedAt: string;
}

export interface SyncEventInput {
  readonly name: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface LyorCloudSyncApi {
  readonly getState: () => Promise<CloudSyncState>;
  readonly bootstrap: () => Promise<CloudSyncState>;
  readonly updateSettings: (input: CloudSettingsInput) => Promise<CloudSyncState>;
  readonly setFavorite: (input: FavoriteMutationInput) => Promise<CloudSyncState>;
  readonly upsertLibrary: (input: LibraryUpsertInput) => Promise<CloudSyncState>;
  readonly removeLibrary: (input: LibraryRemoveInput) => Promise<CloudSyncState>;
  readonly updateDeviceSummary: (input: DeviceSummaryInput) => Promise<CloudSyncState>;
  readonly recordEvent: (input: SyncEventInput) => Promise<CloudSyncState>;
  readonly retryPending: () => Promise<CloudSyncState>;
  readonly onStateChange: (listener: (state: CloudSyncState) => void) => () => void;
}
