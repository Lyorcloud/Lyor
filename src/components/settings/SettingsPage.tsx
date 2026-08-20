import { useMemo, useState, type ReactNode } from 'react';

import { useUpdater, type UpdateState } from '../../hooks/useUpdater';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n';
import { useAppSettings, type ThemeId } from '../../settings/AppSettingsContext';
import {
  getMockGameDiscoveryEntries,
  requestGamePathChangeMock,
  scanForGamesMock,
} from '../../services/mockGameDiscoveryService';
import { LanguageOption } from './LanguageOption';
import { ThemeCard } from './ThemeCard';
import { Toggle } from './Toggle';

const themeTranslationKeys = {
  'ice-max': ['theme.iceMax', 'theme.iceMaxDescription'],
  dark: ['theme.dark', 'theme.darkDescription'],
  light: ['theme.light', 'theme.lightDescription'],
} as const;

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const normalized = value / 1024 ** unitIndex;
  return `${normalized.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function versionLabel(version: string): string {
  return version === '—' || version.startsWith('v') ? version : `v${version}`;
}

function SettingsSection({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <section className="settings-card">
      <header className="settings-card__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="settings-card__body">{children}</div>
    </section>
  );
}

function updateStatusMessage(
  state: UpdateState,
  t: ReturnType<typeof useI18n>['t'],
): string | null {
  switch (state.status) {
    case 'checking':
      return t('updates.checking');
    case 'upToDate':
      return t('updates.upToDate');
    case 'updateAvailable':
      return t('updates.available', { version: state.availableVersion ?? '' });
    case 'downloading':
      return t('updates.downloading', { percent: Math.round(state.progress?.percent ?? 0) });
    case 'downloaded':
      return t('updates.ready');
    case 'error':
      return t('updates.error');
    case 'idle':
      return null;
  }
}

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const { autoDetectGames, setAutoDetectGames, setTheme, theme } = useAppSettings();
  const updater = useUpdater();
  const [gameNoticeKey, setGameNoticeKey] = useState<TranslationKey>('games.mockNotice');
  const [mockScanning, setMockScanning] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const mockGames = useMemo(() => getMockGameDiscoveryEntries(), []);

  const lastChecked = useMemo(() => {
    if (!updater.state.lastCheckedAt) {
      return t('updates.neverChecked');
    }

    const parsedDate = new Date(updater.state.lastCheckedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return t('updates.neverChecked');
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsedDate);
  }, [locale, t, updater.state.lastCheckedAt]);

  const statusMessage = updater.bridgeAvailable
    ? updateStatusMessage(updater.state, t)
    : t('updates.desktopOnly');
  const updateBusy = updater.state.status === 'checking' || updater.state.status === 'downloading';

  const handleMockScan = async () => {
    setMockScanning(true);
    await scanForGamesMock();
    setMockScanning(false);
    setGameNoticeKey('games.mockScanComplete');
  };

  const handleMockPathChange = async () => {
    await requestGamePathChangeMock();
    setGameNoticeKey('games.mockPathUnavailable');
  };

  const handleUpdateAction = async () => {
    if (updater.state.status === 'updateAvailable') {
      await updater.downloadUpdate();
      return;
    }
    if (updater.state.status === 'downloaded') {
      await updater.restartAndInstall();
      return;
    }
    await updater.checkForUpdates();
  };

  const updateActionLabel = updater.state.status === 'updateAvailable'
    ? t('updates.update')
    : updater.state.status === 'downloading'
      ? t('updates.downloading', { percent: Math.round(updater.state.progress?.percent ?? 0) })
      : updater.state.status === 'downloaded'
        ? t('updates.restartAndInstall')
        : updater.state.status === 'checking'
          ? t('updates.checking')
          : t('updates.check');

  return (
    <div className="settings-page">
      <SettingsSection
        description={t('settings.appearanceDescription')}
        title={t('settings.appearance')}
      >
        <div className="theme-options">
          {(Object.keys(themeTranslationKeys) as ThemeId[]).map((themeId) => {
            const [nameKey, descriptionKey] = themeTranslationKeys[themeId];
            const name = t(nameKey);
            return (
              <ThemeCard
                description={t(descriptionKey)}
                key={themeId}
                label={name}
                onSelect={setTheme}
                selected={theme === themeId}
                selectedLabel={t('theme.selected', { theme: name })}
                selectLabel={t('theme.select', { theme: name })}
                theme={themeId}
              />
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        description={t('settings.languageDescription')}
        title={t('settings.language')}
      >
        <div aria-label={t('settings.language')} className="language-options" role="group">
          <LanguageOption
            label={t('language.turkish')}
            locale="tr"
            onSelect={setLocale}
            selected={locale === 'tr'}
          />
          <LanguageOption
            label={t('language.english')}
            locale="en"
            onSelect={setLocale}
            selected={locale === 'en'}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        description={t('settings.gamesDescription')}
        title={t('settings.games')}
      >
        <Toggle
          checked={autoDetectGames}
          description={t('games.autoDetectDescription')}
          label={t('games.autoDetect')}
          onChange={setAutoDetectGames}
        />
        <div className="settings-card__actions">
          <button
            className="settings-action-button"
            disabled={mockScanning}
            onClick={() => void handleMockScan()}
            type="button"
          >
            {mockScanning ? t('games.scanning') : t('games.scan')}
          </button>
          <p aria-live="polite" className="settings-notice">{t(gameNoticeKey)}</p>
        </div>
        <div className="detected-games">
          {mockGames.map(({ game, path, status }) => (
            <article className="detected-game" key={game.id}>
              <img alt="" aria-hidden="true" src={game.imageSrc} />
              <div className="detected-game__identity">
                <strong>{game.name}</strong>
                <span className={`detected-game__status detected-game__status--${status}`}>
                  {t('games.notDetected')}
                </span>
              </div>
              <span
                className="detected-game__path"
                tabIndex={0}
                title={path ?? t('games.pathNotSelected')}
              >
                {path ?? t('games.pathNotSelected')}
              </span>
              <button
                className="settings-text-button"
                onClick={() => void handleMockPathChange()}
                type="button"
              >
                {t('games.changePath')}
              </button>
            </article>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        description={t('settings.updatesDescription')}
        title={t('settings.updates')}
      >
        <Toggle
          checked={updater.autoCheckEnabled}
          description={t('updates.autoCheckDescription')}
          disabled={!updater.bridgeAvailable}
          label={t('updates.autoCheck')}
          onChange={(enabled) => void updater.setAutoCheckEnabled(enabled)}
        />
        <dl className="update-facts">
          <div>
            <dt>{t('updates.currentVersion')}</dt>
            <dd>{versionLabel(updater.state.currentVersion)}</dd>
          </div>
          <div>
            <dt>{t('updates.lastChecked')}</dt>
            <dd>{lastChecked}</dd>
          </div>
        </dl>
        {statusMessage ? (
          <p
            aria-live="polite"
            className={`update-status update-status--${updater.state.status}`}
          >
            {statusMessage}
          </p>
        ) : null}
        {updater.state.status === 'downloading' && updater.state.progress ? (
          <div className="update-progress">
            <progress
              aria-label={statusMessage ?? t('updates.downloading', { percent: 0 })}
              max={100}
              value={updater.state.progress.percent}
            />
            <span>
              {t('updates.downloadProgress', {
                speed: formatBytes(updater.state.progress.bytesPerSecond),
                total: formatBytes(updater.state.progress.total),
                transferred: formatBytes(updater.state.progress.transferred),
              })}
            </span>
          </div>
        ) : null}
        {updater.state.status === 'downloaded' && updateDeferred ? (
          <p className="settings-notice">{t('updates.deferred')}</p>
        ) : null}
        <div className="settings-card__actions settings-card__actions--inline">
          <button
            className="settings-action-button"
            disabled={!updater.bridgeAvailable || updateBusy}
            onClick={() => void handleUpdateAction()}
            type="button"
          >
            {updateActionLabel}
          </button>
          {updater.state.status === 'downloaded' && !updateDeferred ? (
            <button
              className="settings-text-button"
              onClick={() => setUpdateDeferred(true)}
              type="button"
            >
              {t('updates.later')}
            </button>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.about')}>
        <div className="about-panel">
          <img
            alt=""
            aria-hidden="true"
            className="about-panel__logo"
            src="./assets/lyor/app-logo.png"
          />
          <div className="about-panel__copy">
            <h3>{t('about.product')}</h3>
            <p>{t('about.version', { version: versionLabel(updater.state.currentVersion) })}</p>
            <p>{t('about.build', {
              build: t(import.meta.env.PROD ? 'about.productionBuild' : 'about.developmentBuild'),
            })}</p>
            <p>{t('about.platform')}</p>
            <p className="about-panel__description">{t('about.description')}</p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
