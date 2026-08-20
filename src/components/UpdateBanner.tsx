import { useCallback, useEffect, useRef, useState } from 'react';

import { useUpdater } from '../hooks/useUpdater';
import { useI18n } from '../i18n/I18nContext';

const DISMISS_KEY_PREFIX = 'lyor.update-dismissed.';

function wasDismissed(version: string | null): boolean {
  if (!version) {
    return false;
  }

  try {
    return window.sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${version}`) === 'true';
  } catch {
    return false;
  }
}

function getFocusableElements(container: HTMLElement | null): readonly HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

/** Displays only after the main process confirms a newer stable release. */
export function UpdateOverlay() {
  const { t } = useI18n();
  const updater = useUpdater();
  const version = updater.state.availableVersion;
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const dismissed = dismissedVersion === version || wasDismissed(version);
  const hasUpdateFlow = (
    updater.state.status === 'updateAvailable' ||
    updater.state.status === 'downloading' ||
    updater.state.status === 'downloaded' ||
    updater.state.status === 'error'
  );
  const isOpen = !dismissed && Boolean(version) && hasUpdateFlow;

  const dismiss = useCallback(() => {
    if (version) {
      setDismissedVersion(version);
      try {
        window.sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${version}`, 'true');
      } catch {
        // Dismissal still applies until the renderer is reloaded.
      }
    }
  }, [version]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => {
      getFocusableElements(dialogRef.current)[0]?.focus();
    }, 0);
    const status = updater.state.status;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'downloading' && status !== 'downloaded') {
        event.preventDefault();
        dismiss();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = getFocusableElements(dialogRef.current);
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dismiss, isOpen, updater.state.status]);

  if (!isOpen || !version) {
    return null;
  }

  const isDownloading = updater.state.status === 'downloading';
  const isDownloaded = updater.state.status === 'downloaded';
  const hasError = updater.state.status === 'error';
  const progress = updater.state.progress?.percent ?? 0;
  const title = isDownloaded
    ? t('updates.overlayReadyTitle')
    : isDownloading
      ? t('updates.overlayDownloadingTitle')
      : hasError
        ? t('updates.overlayErrorTitle')
        : t('updates.overlayAvailableTitle');
  const description = isDownloaded
    ? t('updates.overlayReadyDescription')
    : isDownloading
      ? t('updates.downloading', { percent: Math.round(progress) })
      : hasError
        ? (updater.state.error?.message ?? t('updates.error'))
        : t('updates.available', { version });

  return (
    <div className="update-overlay" role="presentation">
      <section
        aria-describedby="update-overlay-description"
        aria-labelledby="update-overlay-title"
        aria-modal="true"
        className="update-overlay__dialog"
        ref={dialogRef}
        role="dialog"
      >
        <p className="update-overlay__eyebrow">Lyor</p>
        <h2 id="update-overlay-title">{title}</h2>
        <p id="update-overlay-description">{description}</p>
        {isDownloading ? (
          <div className="update-overlay__progress">
            <progress aria-label={description} max={100} value={progress} />
            <span>{Math.round(progress)}%</span>
          </div>
        ) : null}
        {!isDownloading && !isDownloaded && !hasError && updater.state.releaseNotes ? (
          <p className="update-overlay__notes">{updater.state.releaseNotes}</p>
        ) : null}
        <div className="update-overlay__actions">
          {isDownloaded ? (
            <>
              <button className="update-overlay__primary" onClick={() => void updater.restartAndInstall()} type="button">
                {t('updates.restartAndInstall')}
              </button>
              <button className="update-overlay__secondary" onClick={dismiss} type="button">
                {t('updates.later')}
              </button>
            </>
          ) : isDownloading ? null : hasError ? (
            <>
              <button className="update-overlay__primary" onClick={() => void updater.checkForUpdates()} type="button">
                {t('updates.retry')}
              </button>
              <button className="update-overlay__secondary" onClick={dismiss} type="button">
                {t('updates.later')}
              </button>
            </>
          ) : (
            <>
              <button className="update-overlay__primary" onClick={() => void updater.downloadUpdate()} type="button">
                {t('updates.update')}
              </button>
              <button className="update-overlay__secondary" onClick={dismiss} type="button">
                {t('updates.later')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
