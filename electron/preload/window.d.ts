import type { WindowControlsApi } from '../shared/window-controls';
import type { LyorUpdaterApi } from '../shared/updater';
import type { LyorAuthApi } from '../shared/auth';
import type { LyorCloudSyncApi } from '../shared/cloud-sync';
import type { LyorInstallationEngineApi } from '../shared/installation-engine';
import type { LyorPlanariaApi } from '../shared/planaria';
import type { PlanariaAuthApi } from '../shared/planaria-auth';

declare global {
  interface Window {
    readonly windowControls: Readonly<WindowControlsApi>;
    readonly lyorUpdater: Readonly<LyorUpdaterApi>;
    readonly lyorAuth: Readonly<LyorAuthApi>;
    readonly lyorCloudSync: Readonly<LyorCloudSyncApi>;
    readonly lyorInstallationEngine: Readonly<LyorInstallationEngineApi>;
    readonly lyorPlanaria: Readonly<LyorPlanariaApi>;
    readonly planariaAuth: Readonly<PlanariaAuthApi>;
  }
}

export {};
