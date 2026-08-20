export const WINDOW_CONTROL_CHANNELS = {
  minimize: 'window-controls:minimize',
  maximize: 'window-controls:maximize',
  close: 'window-controls:close',
  getMaximized: 'window-controls:get-maximized',
  toggle: 'window-controls:toggle',
} as const;

export type WindowControlChannel =
  (typeof WINDOW_CONTROL_CHANNELS)[keyof typeof WINDOW_CONTROL_CHANNELS];

export interface WindowControlsApi {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  getMaximized: () => Promise<boolean>;
  toggle: () => Promise<boolean>;
}
