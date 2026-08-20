import type { WindowControlsApi } from '../shared/window-controls';
import type { LyorUpdaterApi } from '../shared/updater';
import type { LyorAuthApi } from '../shared/auth';

declare global {
  interface Window {
    readonly windowControls: Readonly<WindowControlsApi>;
    readonly lyorUpdater: Readonly<LyorUpdaterApi>;
    readonly lyorAuth: Readonly<LyorAuthApi>;
  }
}

export {};
