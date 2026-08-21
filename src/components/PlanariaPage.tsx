import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import type {
  PlanariaDashboardSnapshot,
  PlanariaFileSelection,
  PlanariaGame,
  PlanariaModVersion,
  PlanariaUploadProgress,
} from '../../electron/shared/planaria';
import { useUpdater } from '../hooks/useUpdater';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n';
import { ManageBillboards } from './ManageBillboards';

type PlanariaTab = 'overview' | 'mods' | 'upload' | 'billboards' | 'admins' | 'releases';
const tabKeys: Readonly<Record<PlanariaTab, TranslationKey>> = {
  overview: 'planaria.nav.overview', mods: 'planaria.nav.mods', upload: 'planaria.nav.upload',
  billboards: 'planaria.nav.billboards', admins: 'planaria.nav.admins', releases: 'planaria.nav.releases',
};
const stateKeys: Readonly<Record<string, TranslationKey>> = {
  draft: 'planaria.state.draft', ready: 'planaria.state.ready',
  published: 'planaria.state.published', disabled: 'planaria.state.disabled',
};
const uploadStatusKeys: Readonly<Record<PlanariaUploadProgress['status'], TranslationKey>> = {
  preparing: 'planaria.upload.preparing', uploading: 'planaria.upload.uploading',
  finalizing: 'planaria.upload.finalizing', success: 'planaria.upload.success', error: 'planaria.upload.error',
};

const formatBytes = (value: number): string => {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
};

const gameAliases: Readonly<Record<string, readonly string[]>> = {
  'game-red-dead-redemption-2': ['red dead', 'red dead 2', 'rdr', 'rdr2'],
  'gta5-legacy': ['gta', 'gta 5', 'gta v', 'grand theft auto'],
  'game-spider-man-2': ['spider man', 'spiderman', 'sm2'],
  'game-spider-man-remastered': ['spider man remastered', 'spiderman remastered', 'smr'],
  'game-resident-evil-4-remake': ['resident evil', 're4', 're4 remake'],
  'game-cyberpunk-2077': ['cyberpunk', 'cp2077'],
  'game-elden-ring': ['elden', 'er'],
  'game-hell-is-us': ['hell is us', 'hiu'],
};
const normalizeGameSearch = (value: string): string => value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').trim();

function GameCombobox({ games, value, onChange }: {
  readonly games: readonly PlanariaGame[];
  readonly value: string;
  readonly onChange: (game: PlanariaGame) => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const selected = games.find((game) => game.id === value);
  const [query, setQuery] = useState(selected?.displayName ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => {
    const needle = normalizeGameSearch(query);
    const enabled = games.filter((game) => game.enabled);
    if (!needle) return enabled;
    return enabled.filter((game) => [game.displayName, game.id, ...(gameAliases[game.id] ?? [])]
      .some((candidate) => normalizeGameSearch(candidate).includes(needle)));
  }, [games, query]);
  const choose = (game: PlanariaGame) => {
    onChange(game); setQuery(game.displayName); setOpen(false); setActiveIndex(0);
  };
  return (
    <div className="planaria-game-combobox" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOpen(false); setQuery(selected?.displayName ?? '');
      }
    }}>
      <label htmlFor={`${listId}-input`}>{t('planaria.gameName')}</label>
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        id={`${listId}-input`}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActiveIndex((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter' && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
        }}
        placeholder={t('planaria.gameSearchPlaceholder')}
        role="combobox"
        value={query}
      />
      {open ? <div className="planaria-game-options" id={listId} role="listbox">
        {matches.map((game, index) => <button
          aria-selected={game.id === value}
          className={index === activeIndex ? 'is-active' : ''}
          key={game.id}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(game)}
          role="option"
          type="button"
        ><strong>{game.displayName}</strong><small>{game.edition}</small></button>)}
        {matches.length === 0 ? <p>{t('planaria.gameSearchEmpty')}</p> : null}
      </div> : null}
    </div>
  );
}

interface SharedProps {
  readonly snapshot: PlanariaDashboardSnapshot;
  readonly progress: PlanariaUploadProgress | null;
  readonly refresh: () => Promise<void>;
}

function Overview({ snapshot }: Pick<SharedProps, 'snapshot'>) {
  const { t, locale } = useI18n();
  const stats = [
    ['planaria.stats.totalMods', snapshot.stats.totalMods],
    ['planaria.stats.publishedMods', snapshot.stats.publishedMods],
    ['planaria.stats.downloads', snapshot.stats.completedDownloads],
    ['planaria.stats.billboards', snapshot.stats.activeBillboards],
    ['planaria.stats.admins', snapshot.stats.adminAccounts],
  ] as const satisfies readonly [TranslationKey, number][];
  return (
    <div className="planaria-dashboard-stack">
      <div className="planaria-stat-grid">
        {stats.map(([key, value]) => <article className="planaria-stat" key={key}><span>{t(key)}</span><strong>{value.toLocaleString(locale)}</strong></article>)}
      </div>
      <section className="planaria-panel">
        <div className="planaria-panel__heading"><div><p className="planaria-eyebrow">Audit</p><h2>{t('planaria.recentActivity')}</h2></div></div>
        <div className="planaria-activity-list">
          {snapshot.recentActivity.map((item) => (
            <article key={item.id}>
              <span className="planaria-activity-icon" aria-hidden="true" />
              <div><strong>{item.action}</strong><p>{item.summary}</p></div>
              <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
            </article>
          ))}
          {snapshot.recentActivity.length === 0 ? <p>{t('planaria.noActivity')}</p> : null}
        </div>
      </section>
    </div>
  );
}

function ModManagement({ snapshot, refresh }: Pick<SharedProps, 'snapshot' | 'refresh'>) {
  const { t } = useI18n();
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState('');
  const packages = useMemo(() => new Map(snapshot.packages.map((item) => [item.versionId, item])), [snapshot.packages]);
  const transition = async (version: PlanariaModVersion, action: 'ready' | 'publish' | 'disable') => {
    setPendingId(version.id); setError('');
    try {
      await window.lyorPlanaria.transitionVersion({ action, versionId: version.id, expectedUpdatedAt: version.updatedAt });
      await refresh();
    } catch { setError(t('planaria.requestFailed')); }
    finally { setPendingId(''); }
  };
  return (
    <section className="planaria-panel">
      <div className="planaria-panel__heading"><div><p className="planaria-eyebrow">Catalog</p><h2>{t('planaria.nav.mods')}</h2></div><span>{snapshot.mods.length}</span></div>
      {error ? <p className="planaria-error" role="alert">{error}</p> : null}
      <div className="planaria-mod-list">
        {snapshot.mods.map((mod) => {
          const versions = snapshot.versions.filter((version) => version.modId === mod.id);
          return (
            <article key={mod.id}>
              <header><div><h3>{mod.name}</h3><p>{mod.id} · {mod.gameId}</p></div><span className={`planaria-state planaria-state--${mod.state}`}>{t(stateKeys[mod.state] ?? 'planaria.state.draft')}</span></header>
              <p>{mod.summary}</p>
              <div className="planaria-version-list">
                {versions.map((version) => {
                  const storedPackage = packages.get(version.id);
                  return (
                    <div key={version.id}>
                      <div><strong>v{version.version}</strong><small>{version.gameEdition} · {version.adapterId}</small></div>
                      <span className={`planaria-package-state ${storedPackage?.verifiedAt ? 'is-verified' : ''}`}>
                        {storedPackage?.verifiedAt ? `${t('planaria.packageVerified')} · ${formatBytes(storedPackage.byteSize)}` : t('planaria.packageMissing')}
                      </span>
                      <div className="planaria-inline-actions">
                        {version.state === 'draft' ? <button disabled={pendingId === version.id || !storedPackage?.verifiedAt} onClick={() => void transition(version, 'ready')} type="button">{t('planaria.markReady')}</button> : null}
                        {version.state === 'ready' ? <button disabled={pendingId === version.id} onClick={() => void transition(version, 'publish')} type="button">{t('planaria.publish')}</button> : null}
                        {version.state === 'ready' || version.state === 'published' ? <button disabled={pendingId === version.id} onClick={() => void transition(version, 'disable')} type="button">{t('planaria.disable')}</button> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {snapshot.mods.length === 0 ? <p>{t('planaria.modsEmpty')}</p> : null}
      </div>
    </section>
  );
}

function ModUpload({ snapshot, progress, refresh }: SharedProps) {
  const { t } = useI18n();
  const [modId, setModId] = useState('');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [targetInputMode, setTargetInputMode] = useState<'browse' | 'manual'>('browse');
  const [installationMode, setInstallationMode] = useState<'replace' | 'add-on'>('replace');
  const [gameId, setGameId] = useState(snapshot.games[0]?.id ?? '');
  const [edition, setEdition] = useState(snapshot.games[0]?.edition ?? 'standard');
  const [version, setVersion] = useState('1.0.0');
  const [range, setRange] = useState('');
  const [adapter, setAdapter] = useState('generic-files');
  const [dependencies, setDependencies] = useState('');
  const [conflicts, setConflicts] = useState('');
  const [manifestText, setManifestText] = useState('{\n  "schemaVersion": 2,\n  "operations": []\n}');
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionUpdatedAt, setVersionUpdatedAt] = useState<string | null>(null);
  const [packageFile, setPackageFile] = useState<PlanariaFileSelection | null>(null);
  const [imageFile, setImageFile] = useState<PlanariaFileSelection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const parsedManifest = useMemo(() => {
    try {
      const value: unknown = JSON.parse(manifestText);
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch { return null; }
  }, [manifestText]);
  const currentVersion = versionId ? snapshot.versions.find((item) => item.id === versionId) : undefined;
  const normalizedTargetPath = targetPath.trim().replaceAll('\\', '/');
  const targetPathValid = normalizedTargetPath.length > 0 && normalizedTargetPath.length <= 1024 &&
    !normalizedTargetPath.startsWith('/') && !/^[a-z]:/iu.test(normalizedTargetPath) &&
    !normalizedTargetPath.split('/').includes('..') && !normalizedTargetPath.includes('\0');

  const run = async (operation: () => Promise<void>) => {
    setPending(true); setError(''); setNotice('');
    try { await operation(); }
    catch { setError(t('planaria.requestFailed')); }
    finally { setPending(false); }
  };
  const choose = async (purpose: 'mod-package' | 'mod-image') => {
    try {
      const selected = await window.lyorPlanaria.selectFile(purpose);
      if (selected) {
        if (purpose === 'mod-package') setPackageFile(selected);
        else setImageFile(selected);
      }
    } catch { setError(t('planaria.requestFailed')); }
  };
  const chooseTargetPath = async () => {
    setTargetInputMode('browse'); setError('');
    try {
      const selectedTarget = await window.lyorPlanaria.selectTargetPath();
      if (selectedTarget) setTargetPath(selectedTarget.relativePath);
    } catch { setError(t('planaria.targetPathBrowseError')); }
  };
  const save = () => run(async () => {
    if (!parsedManifest) throw new Error('invalid');
    const result = await window.lyorPlanaria.saveDraft({
      modId, name, summary, gameId, versionId, version, gameEdition: edition,
      gameVersionRange: range.trim() || null, manifestSchemaVersion: 2,
      manifest: {
        ...parsedManifest, schemaVersion: 2,
        installation: { mode: installationMode, targetPath: normalizedTargetPath },
        dependencies: dependencies.split(',').map((item) => item.trim()).filter(Boolean),
        conflicts: conflicts.split(',').map((item) => item.trim()).filter(Boolean),
      },
      adapterId: adapter, expectedUpdatedAt: versionUpdatedAt,
    });
    setVersionId(result.versionId); setVersionUpdatedAt(result.versionUpdatedAt);
    setNotice(t('planaria.saved')); await refresh();
  });
  const uploadPackage = () => run(async () => {
    if (!packageFile || !versionId) throw new Error('missing');
    await window.lyorPlanaria.uploadPackage({ selectionId: packageFile.id, versionId, modId, version });
    setPackageFile(null); await refresh();
  });
  const uploadImage = () => run(async () => {
    if (!imageFile || !versionId) throw new Error('missing');
    await window.lyorPlanaria.uploadModMedia({ selectionId: imageFile.id, modId });
    setImageFile(null); await refresh();
  });
  const transition = (action: 'ready' | 'publish' | 'disable') => run(async () => {
    const target = snapshot.versions.find((item) => item.id === versionId);
    if (!target) throw new Error('missing');
    await window.lyorPlanaria.transitionVersion({ action, versionId: target.id, expectedUpdatedAt: target.updatedAt });
    await refresh();
  });

  return (
    <section className="planaria-panel planaria-upload-page">
      <div className="planaria-panel__heading"><div><p className="planaria-eyebrow">Object storage</p><h2>{t('planaria.nav.upload')}</h2></div>{currentVersion ? <span className={`planaria-state planaria-state--${currentVersion.state}`}>{t(stateKeys[currentVersion.state] ?? 'planaria.state.draft')}</span> : null}</div>
      <section className="planaria-mod-hero-upload">
        <button aria-label={t('planaria.selectImage')} onClick={() => void choose('mod-image')} type="button">
          <span className="planaria-mod-hero-upload__icon" aria-hidden="true">＋</span>
          <strong>{imageFile?.name ?? t('planaria.heroImageTitle')}</strong>
          <small>{imageFile ? `${imageFile.mimeType} · ${formatBytes(imageFile.size)}` : t('planaria.heroImageHint')}</small>
        </button>
        {imageFile ? <button className="planaria-primary-button" disabled={pending || !versionId} onClick={() => void uploadImage()} type="button">{versionId ? t('planaria.uploadImage') : t('planaria.saveBeforeImage')}</button> : null}
      </section>
      <div className="planaria-form-grid planaria-form-grid--primary">
        <label>{t('planaria.modName')}<input maxLength={160} onChange={(event) => { const next = event.target.value; setName(next); if (!modId) setModId(next.toLowerCase().trim().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 120)); }} value={name} /></label>
        <GameCombobox games={snapshot.games} onChange={(game) => { setGameId(game.id); setEdition(game.edition); }} value={gameId} />
        <label className="planaria-field-wide">{t('planaria.summary')}<textarea maxLength={2000} onChange={(event) => setSummary(event.target.value)} value={summary} /></label>
        <fieldset className="planaria-target-path planaria-field-wide"><legend>{t('planaria.targetPath')}</legend><div className="planaria-target-path__modes"><button aria-pressed={targetInputMode === 'browse'} onClick={() => void chooseTargetPath()} type="button">{t('planaria.targetPathBrowse')}</button><button aria-pressed={targetInputMode === 'manual'} onClick={() => setTargetInputMode('manual')} type="button">{t('planaria.targetPathManual')}</button></div>{targetInputMode === 'manual' ? <input aria-label={t('planaria.targetPathManualInput')} autoComplete="off" maxLength={1024} onChange={(event) => setTargetPath(event.target.value)} placeholder={t('planaria.targetPathPlaceholder')} value={targetPath} /> : <input aria-label={t('planaria.targetPathSelected')} placeholder={t('planaria.targetPathBrowsePlaceholder')} readOnly value={targetPath} />}<small className={targetPath && !targetPathValid ? 'planaria-error' : ''}>{targetPath && !targetPathValid ? t('planaria.targetPathInvalid') : targetInputMode === 'browse' ? t('planaria.targetPathBrowseHint') : t('planaria.targetPathHint')}</small></fieldset>
        <fieldset className="planaria-install-mode planaria-field-wide"><legend>{t('planaria.installMode')}</legend><div><button aria-pressed={installationMode === 'replace'} onClick={() => setInstallationMode('replace')} type="button"><strong>Replace</strong><small>{t('planaria.replaceHint')}</small></button><button aria-pressed={installationMode === 'add-on'} onClick={() => setInstallationMode('add-on')} type="button"><strong>Add-on</strong><small>{t('planaria.addOnHint')}</small></button></div></fieldset>
      </div>
      <details className="planaria-advanced-fields"><summary>{t('planaria.advancedSettings')}</summary><div className="planaria-form-grid">
        <label>{t('planaria.modId')}<input autoComplete="off" maxLength={120} onChange={(event) => setModId(event.target.value.toLowerCase())} value={modId} /></label>
        <label>{t('planaria.edition')}<select onChange={(event) => setEdition(event.target.value)} value={edition}><option value="standard">standard</option><option value="legacy">legacy</option><option value="enhanced">enhanced</option></select></label>
        <label>{t('planaria.version')}<input maxLength={80} onChange={(event) => setVersion(event.target.value)} value={version} /></label>
        <label>{t('planaria.gameVersionRange')}<input maxLength={80} onChange={(event) => setRange(event.target.value)} value={range} /></label>
        <label>{t('planaria.adapter')}<select onChange={(event) => setAdapter(event.target.value)} value={adapter}><option value="generic-files">generic-files</option><option value="synthetic-container-fixture">synthetic-container-fixture</option></select></label>
        <label>{t('planaria.dependencies')}<input onChange={(event) => setDependencies(event.target.value)} value={dependencies} /></label>
        <label>{t('planaria.conflicts')}<input onChange={(event) => setConflicts(event.target.value)} value={conflicts} /></label>
        <label className="planaria-field-wide">{t('planaria.manifest')}<textarea className="planaria-manifest-editor" onChange={(event) => setManifestText(event.target.value)} spellCheck={false} value={manifestText} /><small className={parsedManifest ? 'planaria-valid' : 'planaria-error'}>{parsedManifest ? t('planaria.manifestValid') : t('planaria.manifestInvalid')}</small></label>
      </div></details>
      <div className="planaria-file-grid">
        <article><h3>{t('planaria.package')}</h3><button className="planaria-secondary-button" onClick={() => void choose('mod-package')} type="button">{packageFile?.name ?? t('planaria.selectPackage')}</button>{packageFile ? <dl><div><dt>{t('planaria.size')}</dt><dd>{formatBytes(packageFile.size)}</dd></div><div><dt>SHA-256</dt><dd className="planaria-hash">{packageFile.sha256}</dd></div></dl> : null}<button className="planaria-primary-button" disabled={pending || !packageFile || !versionId} onClick={() => void uploadPackage()} type="button">{t('planaria.uploadPackage')}</button></article>
      </div>
      {progress && (progress.purpose === 'mod-package' || progress.purpose === 'mod-image') ? <div className="planaria-progress" aria-live="polite"><progress max={100} value={progress.percent} /><span>{Math.round(progress.percent)}% · {t(uploadStatusKeys[progress.status])}</span></div> : null}
      {error ? <p className="planaria-error" role="alert">{error}</p> : null}{notice ? <p className="planaria-success" role="status">{notice}</p> : null}
      <div className="planaria-footer-actions"><button className="planaria-primary-button" disabled={pending || !parsedManifest || !modId || !name || !gameId || !targetPathValid} onClick={() => void save()} type="button">{t('planaria.saveDraft')}</button>{currentVersion?.state === 'draft' ? <button disabled={pending} onClick={() => void transition('ready')} type="button">{t('planaria.markReady')}</button> : null}{currentVersion?.state === 'ready' ? <button disabled={pending} onClick={() => void transition('publish')} type="button">{t('planaria.publish')}</button> : null}</div>
    </section>
  );
}

function AdminAccounts({ snapshot, refresh }: Pick<SharedProps, 'snapshot' | 'refresh'>) {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const create = async () => {
    setPending(true); setError('');
    try { await window.lyorPlanaria.createAdmin({ email, username, password }); setEmail(''); setUsername(''); setPassword(''); await refresh(); }
    catch { setError(t('planaria.requestFailed')); }
    finally { setPending(false); }
  };
  return (
    <div className="planaria-dashboard-stack">
      <section className="planaria-panel"><div className="planaria-panel__heading"><div><p className="planaria-eyebrow">RBAC</p><h2>{t('planaria.createAdmin')}</h2></div></div>
        {!snapshot.access.canManageAdmins ? <p className="planaria-notice">{t('planaria.adminDenied')}</p> : <form className="planaria-admin-form" onSubmit={(event) => { event.preventDefault(); void create(); }}><label>{t('planaria.adminEmail')}<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label><label>{t('planaria.adminUsername')}<input autoComplete="off" pattern="[a-z0-9][a-z0-9._-]{2,63}" onChange={(event) => setUsername(event.target.value.toLowerCase())} value={username} /></label><label>{t('planaria.adminPassword')}<input autoComplete="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label><button className="planaria-primary-button" disabled={pending || password.length < 12} type="submit">{t('planaria.createAdmin')}</button></form>}
        {error ? <p className="planaria-error" role="alert">{error}</p> : null}
      </section>
      <section className="planaria-panel"><div className="planaria-panel__heading"><h2>{t('planaria.adminAccounts')}</h2><span>{snapshot.accounts.length}</span></div><div className="planaria-account-list">{snapshot.accounts.map((account) => <article key={account.id}><div><strong>{account.username ?? account.email}</strong><p>{account.email}</p></div><span className="planaria-state">{account.role}</span><small>{t('planaria.lastSignIn')}: {account.lastSignInAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(account.lastSignInAt)) : t('planaria.never')}</small></article>)}</div></section>
    </div>
  );
}

function ReleaseStatus() {
  const { t } = useI18n(); const updater = useUpdater(); const state = updater.state;
  return <section className="planaria-panel"><div className="planaria-panel__heading"><div><p className="planaria-eyebrow">GitHub Releases + electron-updater</p><h2>{t('planaria.releaseTitle')}</h2></div><span className={`planaria-state planaria-state--${state.status}`}>{state.status}</span></div><div className="planaria-release-grid"><article><span>{t('planaria.releaseWorkflow')}</span><strong>release.yml · v1.2.x</strong></article><article><span>{t('planaria.currentVersion')}</span><strong>{state.currentVersion}</strong></article><article><span>{t('planaria.availableVersion')}</span><strong>{state.availableVersion ?? '—'}</strong></article><article><span>{t('planaria.updaterStatus')}</span><strong>{state.status}</strong></article></div>{state.progress ? <div className="planaria-progress"><progress max={100} value={state.progress.percent} /><span>{Math.round(state.progress.percent)}%</span></div> : null}{state.error ? <p className="planaria-error">{state.error.message}</p> : null}<div className="planaria-footer-actions"><button onClick={() => void updater.checkForUpdates()} type="button">{t('planaria.checkUpdates')}</button>{state.status === 'updateAvailable' ? <button className="planaria-primary-button" onClick={() => void updater.downloadUpdate()} type="button">{t('planaria.downloadUpdate')}</button> : null}{state.status === 'downloaded' ? <button className="planaria-primary-button" onClick={() => void updater.restartAndInstall()} type="button">{t('planaria.restartInstall')}</button> : null}</div><p className="planaria-notice">{t('planaria.signingGate')}</p></section>;
}

export function PlanariaPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<PlanariaTab>('overview');
  const [snapshot, setSnapshot] = useState<PlanariaDashboardSnapshot | null>(null);
  const [progress, setProgress] = useState<PlanariaUploadProgress | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try { setSnapshot(await window.lyorPlanaria.getDashboard()); }
    catch { setError(t('planaria.requestFailed')); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => {
    const unsubscribe = window.lyorPlanaria.onUploadProgress(setProgress);
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [refresh]);
  return (
    <div className="planaria-page">
      <header className="planaria-page__header"><div><p>Planaria</p><h1>{t('planaria.title')}</h1></div>{snapshot ? <span className="planaria-page__admin-badge">{snapshot.access.role}</span> : null}</header>
      <nav aria-label={t('planaria.title')} className="planaria-tabs">{(Object.keys(tabKeys) as PlanariaTab[]).map((id) => <button aria-current={tab === id ? 'page' : undefined} key={id} onClick={() => setTab(id)} type="button">{t(tabKeys[id])}</button>)}</nav>
      {loading ? <div className="planaria-loading" role="status">{t('planaria.loading')}</div> : null}
      {error && !snapshot ? <div className="planaria-loading"><p className="planaria-error" role="alert">{error}</p><button onClick={() => void refresh()} type="button">{t('planaria.retry')}</button></div> : null}
      {snapshot ? <>{tab === 'overview' ? <Overview snapshot={snapshot} /> : null}{tab === 'mods' ? <ModManagement refresh={refresh} snapshot={snapshot} /> : null}{tab === 'upload' ? <ModUpload progress={progress} refresh={refresh} snapshot={snapshot} /> : null}{tab === 'billboards' ? <ManageBillboards items={snapshot.billboards} onRefresh={refresh} progress={progress} /> : null}{tab === 'admins' ? <AdminAccounts refresh={refresh} snapshot={snapshot} /> : null}{tab === 'releases' ? <ReleaseStatus /> : null}</> : null}
    </div>
  );
}
