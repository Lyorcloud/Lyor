import type { WindowControlsApi } from '../shared/window-controls';
import type { LyorUpdaterApi } from '../shared/updater';

declare global {
  interface Window {
    readonly windowControls: Readonly<WindowControlsApi>;
    readonly lyorUpdater: Readonly<LyorUpdaterApi>;
  }
}

export {};
