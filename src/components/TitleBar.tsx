import { useCallback, useEffect, useState, type MouseEvent } from 'react';

import { Headbar } from './Headbar';

interface WindowControlBridge {
  close: () => Promise<void>;
  getMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  toggle: () => Promise<boolean>;
}

interface TitleBarProps extends React.ComponentProps<typeof Headbar> {
  readonly closeLabel: string;
  readonly maximizeLabel: string;
  readonly minimizeLabel: string;
  readonly restoreLabel: string;
  readonly windowControlsLabel: string;
}

function getWindowControls(): WindowControlBridge | undefined {
  return (window as Window & { windowControls?: WindowControlBridge }).windowControls;
}

export function TitleBar({
  closeLabel,
  maximizeLabel,
  minimizeLabel,
  restoreLabel,
  windowControlsLabel,
  ...headbarProps
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void getWindowControls()?.getMaximized().then(setIsMaximized).catch(() => undefined);
  }, []);

  const toggleMaximized = useCallback(async () => {
    try {
      const nextState = await getWindowControls()?.toggle();
      if (typeof nextState === 'boolean') {
        setIsMaximized(nextState);
      }
    } catch {
      // The browser-only Vite preview has no native window bridge.
    }
  }, []);

  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('[data-no-drag]')) {
      return;
    }
    void toggleMaximized();
  };

  return (
    <header className="title-bar" onDoubleClick={handleDoubleClick}>
      <Headbar {...headbarProps} />
      <div aria-label={windowControlsLabel} className="window-controls" data-no-drag role="group">
        <button
          aria-label={closeLabel}
          className="window-control window-control--close"
          onClick={() => void getWindowControls()?.close()}
          title={closeLabel}
          type="button"
        />
        <button
          aria-label={minimizeLabel}
          className="window-control window-control--minimize"
          onClick={() => void getWindowControls()?.minimize()}
          title={minimizeLabel}
          type="button"
        />
        <button
          aria-label={isMaximized ? restoreLabel : maximizeLabel}
          className="window-control window-control--maximize"
          onClick={() => void toggleMaximized()}
          title={isMaximized ? restoreLabel : maximizeLabel}
          type="button"
        />
      </div>
    </header>
  );
}
