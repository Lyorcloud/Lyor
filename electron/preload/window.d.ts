import type { WindowControlsApi } from '../shared/window-controls';
import type { LyorUpdaterApi } from '../shared/updater';
import type { LyorAuthApi } from '../shared/auth';
import type { LyorCloudSyncApi } from '../shared/cloud-sync';
import type { LyorInstallationEngineApi } from '../shared/installation-engine';

declare global {
  interface Window {
    readonly windowControls: Readonly<WindowControlsApi>;
    readonly lyorUpdater: Readonly<LyorUpdaterApi>;
    readonly lyorAuth: Readonly<LyorAuthApi>;
    readonly lyorCloudSync: Readonly<LyorCloudSyncApi>;
    readonly lyorInstallationEngine: Readonly<LyorInstallationEngineApi>;
  }
}

export {};
