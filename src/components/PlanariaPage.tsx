import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type {
  PlanariaDashboardSnapshot,
  PlanariaFileSelection,
  PlanariaContentSelection,
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
const stateKeys: Readonly<Record<PlanariaModVersion['state'], TranslationKey>> = {
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

type AnalyticsRange = '30d' | '3m' | '6m' | '12m';
type ModSort = 'newest' | 'oldest' | 'downloads' | 'name-asc' | 'name-desc';
type ModStateFilter = 'all' | PlanariaModVersion['state'];
type InstallModeFilter = 'all' | 'replace' | 'add-on';

const analyticsRangeKeys: Readonly<Record<AnalyticsRange, TranslationKey>> = {
  '30d': 'planaria.range.30d',
  '3m': 'planaria.range.3m',
  '6m': 'planaria.range.6m',
  '12m': 'planaria.range.12m',
};

const modSortKeys: Readonly<Record<ModSort, TranslationKey>> = {
  newest: 'planaria.sort.newest',
  oldest: 'planaria.sort.oldest',
  downloads: 'planaria.sort.downloads',
  'name-asc': 'planaria.sort.nameAsc',
  'name-desc': 'planaria.sort.nameDesc',
};

const analyticsSeeds: Readonly<Record<AnalyticsRange, readonly number[]>> = {
  '30d': [19, 26, 23, 36, 34, 48, 44, 59, 55, 69, 66, 81],
  '3m': [14, 20, 26, 25, 37, 43, 41, 54, 63, 61, 74, 86],
  '6m': [11, 16, 22, 31, 29, 43, 48, 58, 56, 69, 78, 91],
  '12m': [8, 13, 19, 26, 33, 39, 47, 57, 64, 72, 84, 96],
};

const chartPoints = (values: readonly number[], width = 640, height = 172): string => {
  const maximum = Math.max(...values, 1);
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - (value / maximum) * (height - 18) - 9;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const readInstallMode = (version: PlanariaModVersion | undefined): 'replace' | 'add-on' | 'unknown' => {
  const installation = version?.manifest.installation;
  if (!installation || typeof installation !== 'object' || Array.isArray(installation)) return 'unknown';
  const mode = (installation as Readonly<Record<string, unknown>>).mode;
  return mode === 'replace' || mode === 'add-on' ? mode : 'unknown';
};

const mockModDownloads = (id: string, total: number): number => {
  const seed = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return Math.max(12, Math.round(Math.max(total, 80) * (0.18 + (seed % 58) / 100)));
};

function AnalyticsDashboard({ snapshot }: Pick<SharedProps, 'snapshot'>) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const analytics = useMemo(() => {
    const seeds = analyticsSeeds[range];
    const rangeFactor = ({ '30d': 1, '3m': 2.4, '6m': 4.8, '12m': 8.7 } as const)[range];
    const completedDownloads = Math.max(snapshot.stats.completedDownloads, 72);
    const downloads = seeds.map((seed) => Math.round((seed / 96) * completedDownloads * rangeFactor));
    const users = seeds.map((seed, index) => Math.round(seed * rangeFactor * 1.7 + index * 5));
    return {
      downloads,
      users,
      newUsers: Math.max(users.at(-1) ?? 0, 1),
      totalUsers: Math.max(318, Math.round(completedDownloads * 2.8 + snapshot.stats.totalMods * 17)),
      periodDownloads: downloads.reduce((sum, value) => sum + value, 0),
    };
  }, [range, snapshot.stats.completedDownloads, snapshot.stats.totalMods]);
  const stats = [
    ['planaria.stats.totalUsers', analytics.totalUsers, '+8.4%'],
    ['planaria.stats.totalMods', snapshot.stats.totalMods, `+${snapshot.stats.publishedMods}`],
    ['planaria.stats.downloads', snapshot.stats.completedDownloads, '+12.6%'],
    ['planaria.stats.periodDownloads', analytics.periodDownloads, '+18.2%'],
    ['planaria.stats.newUsers', analytics.newUsers, '+6.9%'],
  ] as const satisfies readonly [TranslationKey, number, string][];
  const downloadPoints = chartPoints(analytics.downloads);
  const userPoints = chartPoints(analytics.users);

  return (
    <section className="planaria-analytics" aria-labelledby="planaria-analytics-title">
      <div className="planaria-section-heading">
        <div>
          <p className="planaria-eyebrow">{t('planaria.analytics')}</p>
          <h2 id="planaria-analytics-title">{t('planaria.dashboardTitle')}</h2>
        </div>
        <div className="planaria-range-control" aria-label={t('planaria.timeRange')} role="group">
          {(Object.keys(analyticsRangeKeys) as AnalyticsRange[]).map((id) => (
            <button aria-pressed={range === id} key={id} onClick={() => setRange(id)} type="button">{t(analyticsRangeKeys[id])}</button>
          ))}
        </div>
      </div>
      <div className="planaria-preview-notice"><span aria-hidden="true">◇</span>{t('planaria.sampleAnalytics')}</div>
      <div className="planaria-stat-grid">
        {stats.map(([key, value, delta]) => (
          <article className="planaria-stat" key={key}>
            <div><span>{t(key)}</span><small>{delta}</small></div>
            <strong>{value.toLocaleString(locale)}</strong>
          </article>
        ))}
      </div>
      <div className="planaria-analytics-grid">
        <article className="planaria-chart-card">
          <header><div><span>{t('planaria.downloadTrend')}</span><strong>{analytics.periodDownloads.toLocaleString(locale)}</strong></div><div className="planaria-chart-legend"><span className="is-download" />{t('planaria.downloads')}</div></header>
          <div className="planaria-chart" role="img" aria-label={t('planaria.downloadChartLabel')}>
            <span className="planaria-chart__grid" aria-hidden="true" />
            <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 640 172">
              <defs><linearGradient id={`planaria-area-${range}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".34" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
              <polygon className="planaria-chart__area" fill={`url(#planaria-area-${range})`} points={`0,172 ${downloadPoints} 640,172`} />
              <polyline className="planaria-chart__line" points={downloadPoints} />
            </svg>
          </div>
        </article>
        <article className="planaria-chart-card planaria-chart-card--compact">
          <header><div><span>{t('planaria.userGrowth')}</span><strong>+{analytics.newUsers.toLocaleString(locale)}</strong></div><div className="planaria-chart-legend"><span className="is-user" />{t('planaria.users')}</div></header>
          <div className="planaria-chart planaria-chart--users" role="img" aria-label={t('planaria.userChartLabel')}>
            <span className="planaria-chart__grid" aria-hidden="true" />
            <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 640 172"><polyline className="planaria-chart__line" points={userPoints} /></svg>
          </div>
        </article>
      </div>
    </section>
  );
}

function ModManagement({ snapshot, refresh, onUpload }: Pick<SharedProps, 'snapshot' | 'refresh'> & { readonly onUpload: (modId?: string) => void }) {
  const { t, locale } = useI18n();
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<ModStateFilter>('all');
  const [installModeFilter, setInstallModeFilter] = useState<InstallModeFilter>('all');
  const [sort, setSort] = useState<ModSort>('newest');
  const packages = useMemo(() => new Map(snapshot.packages.map((item) => [item.versionId, item])), [snapshot.packages]);
  const games = useMemo(() => new Map(snapshot.games.map((item) => [item.id, item])), [snapshot.games]);
  const media = useMemo(() => new Map(snapshot.media.filter((item) => item.previewUrl).map((item) => [item.modId, item])), [snapshot.media]);
  const versions = useMemo(() => new Map(snapshot.mods.map((mod) => {
    const latest = snapshot.versions.filter((version) => version.modId === mod.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return [mod.id, latest] as const;
  })), [snapshot.mods, snapshot.versions]);
  const visibleMods = useMemo(() => {
    const needle = normalizeGameSearch(query);
    return snapshot.mods.filter((mod) => {
      const version = versions.get(mod.id);
      const game = games.get(mod.gameId);
      const mode = readInstallMode(version);
      return (!needle || [mod.name, mod.summary, game?.displayName ?? '', mod.gameId].some((value) => normalizeGameSearch(value).includes(needle)))
        && (gameFilter === 'all' || mod.gameId === gameFilter)
        && (stateFilter === 'all' || mod.state === stateFilter)
        && (installModeFilter === 'all' || mode === installModeFilter);
    }).sort((left, right) => {
      if (sort === 'newest') return right.createdAt.localeCompare(left.createdAt);
      if (sort === 'oldest') return left.createdAt.localeCompare(right.createdAt);
      if (sort === 'downloads') return mockModDownloads(right.id, snapshot.stats.completedDownloads) - mockModDownloads(left.id, snapshot.stats.completedDownloads);
      return (sort === 'name-asc' ? 1 : -1) * left.name.localeCompare(right.name, locale);
    });
  }, [gameFilter, games, installModeFilter, locale, query, snapshot.mods, snapshot.stats.completedDownloads, sort, stateFilter, versions]);
  const transition = async (version: PlanariaModVersion, action: 'ready' | 'publish' | 'disable') => {
    setPendingId(version.id); setError('');
    try {
      await window.lyorPlanaria.transitionVersion({ action, versionId: version.id, expectedUpdatedAt: version.updatedAt });
      await refresh();
    } catch { setError(t('planaria.requestFailed')); }
    finally { setPendingId(''); }
  };
  return (
    <section className="planaria-management" aria-labelledby="planaria-mod-management-title">
      <div className="planaria-section-heading">
        <div><p className="planaria-eyebrow">{t('planaria.catalog')}</p><h2 id="planaria-mod-management-title">{t('planaria.nav.mods')}</h2></div>
        <button className="planaria-add-button" onClick={() => onUpload()} type="button"><span aria-hidden="true">＋</span>{t('planaria.addMod')}</button>
      </div>
      <div className="planaria-management-toolbar">
        <label className="planaria-toolbar-search"><span className="planaria-search-mark" aria-hidden="true" /><span className="sr-only">{t('planaria.searchMods')}</span><input onChange={(event) => setQuery(event.target.value)} placeholder={t('planaria.searchMods')} value={query} /></label>
        <label><span>{t('planaria.filterGame')}</span><select aria-label={t('planaria.filterGameControl')} onChange={(event) => setGameFilter(event.target.value)} value={gameFilter}><option value="all">{t('planaria.allGames')}</option>{snapshot.games.filter((game) => game.enabled).map((game) => <option key={`${game.id}-${game.edition}`} value={game.id}>{game.displayName}</option>)}</select></label>
        <label><span>{t('planaria.filterType')}</span><select onChange={(event) => setInstallModeFilter(event.target.value as InstallModeFilter)} value={installModeFilter}><option value="all">{t('planaria.allTypes')}</option><option value="replace">Replace</option><option value="add-on">Add-on</option></select></label>
        <label><span>{t('planaria.filterStatus')}</span><select onChange={(event) => setStateFilter(event.target.value as ModStateFilter)} value={stateFilter}><option value="all">{t('planaria.allStatuses')}</option>{(['draft', 'ready', 'published', 'disabled'] as const).map((state) => <option key={state} value={state}>{t(stateKeys[state])}</option>)}</select></label>
        <label><span>{t('planaria.sortBy')}</span><select onChange={(event) => setSort(event.target.value as ModSort)} value={sort}>{(Object.keys(modSortKeys) as ModSort[]).map((id) => <option key={id} value={id}>{t(modSortKeys[id])}</option>)}</select></label>
      </div>
      {error ? <p className="planaria-error" role="alert">{error}</p> : null}
      <div className="planaria-admin-grid">
        {visibleMods.map((mod) => {
          const version = versions.get(mod.id);
          const storedPackage = version ? packages.get(version.id) : undefined;
          const game = games.get(mod.gameId);
          const mode = readInstallMode(version);
          const downloads = mockModDownloads(mod.id, snapshot.stats.completedDownloads);
          return (
            <article className="planaria-admin-card" key={mod.id}>
              <div className="planaria-admin-card__media">
                <img alt="" src={media.get(mod.id)?.previewUrl ?? './assets/figma/mod-placeholder.png'} />
                <span className={`planaria-state planaria-state--${mod.state}`}>{t(stateKeys[mod.state] ?? 'planaria.state.draft')}</span>
                <details className="planaria-card-menu">
                  <summary aria-label={t('planaria.modActions')}>•••</summary>
                  <div>
                    <button onClick={() => onUpload(mod.id)} type="button">{t('planaria.edit')}</button>
                    {version?.state === 'draft' ? <button disabled={pendingId === version.id || !storedPackage?.verifiedAt} onClick={() => void transition(version, 'ready')} type="button">{t('planaria.markReady')}</button> : null}
                    {version?.state === 'ready' ? <button disabled={pendingId === version.id} onClick={() => void transition(version, 'publish')} type="button">{t('planaria.publish')}</button> : null}
                    {version && (version.state === 'ready' || version.state === 'published') ? <button className="planaria-danger-button" disabled={pendingId === version.id} onClick={() => void transition(version, 'disable')} type="button">{t('planaria.disable')}</button> : null}
                  </div>
                </details>
              </div>
              <div className="planaria-admin-card__body">
                <div><p>{game?.displayName ?? mod.gameId}</p><h3 title={mod.name}>{mod.name}</h3></div>
                <p className="planaria-admin-card__summary">{mod.summary}</p>
                <dl className="planaria-admin-card__facts">
                  <div><dt>{t('planaria.downloads')}</dt><dd>{downloads.toLocaleString(locale)}<small>{t('planaria.sample')}</small></dd></div>
                  <div><dt>{t('planaria.size')}</dt><dd>{storedPackage ? formatBytes(storedPackage.byteSize) : '—'}</dd></div>
                  <div><dt>{t('planaria.installMode')}</dt><dd>{mode === 'unknown' ? '—' : mode === 'add-on' ? 'Add-on' : 'Replace'}</dd></div>
                </dl>
                <footer><span>{version ? `v${version.version}` : t('planaria.noVersion')}</span><span className={storedPackage?.verifiedAt ? 'is-verified' : ''}>{storedPackage?.verifiedAt ? t('planaria.packageVerified') : t('planaria.packageMissing')}</span></footer>
              </div>
            </article>
          );
        })}
        {visibleMods.length === 0 ? <div className="planaria-empty-state"><span aria-hidden="true">⌕</span><strong>{t('planaria.noMatchingMods')}</strong><p>{t('planaria.adjustFilters')}</p></div> : null}
      </div>
    </section>
  );
}

function Overview({ snapshot, refresh, onUpload }: Pick<SharedProps, 'snapshot' | 'refresh'> & { readonly onUpload: (modId?: string) => void }) {
  const { t, locale } = useI18n();
  return (
    <div className="planaria-dashboard-stack">
      <AnalyticsDashboard snapshot={snapshot} />
      <ModManagement onUpload={onUpload} refresh={refresh} snapshot={snapshot} />
      <section className="planaria-panel planaria-activity-panel">
        <div className="planaria-panel__heading"><div><p className="planaria-eyebrow">Audit</p><h2>{t('planaria.recentActivity')}</h2></div></div>
        <div className="planaria-activity-list">
          {snapshot.recentActivity.map((item) => (
            <article key={item.id}><span className="planaria-activity-icon" aria-hidden="true" /><div><strong>{item.action}</strong><p>{item.summary}</p></div><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></article>
          ))}
          {snapshot.recentActivity.length === 0 ? <p>{t('planaria.noActivity')}</p> : null}
        </div>
      </section>
    </div>
  );
}

function ModUpload({ snapshot, progress, refresh, initialModId, onClose }: SharedProps & {
  readonly initialModId?: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const initialMod = snapshot.mods.find((item) => item.id === initialModId);
  const initialVersion = initialMod
    ? snapshot.versions.filter((item) => item.modId === initialMod.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
    : undefined;
  const initialInstallation = initialVersion?.manifest.installation && typeof initialVersion.manifest.installation === 'object' && !Array.isArray(initialVersion.manifest.installation)
    ? initialVersion.manifest.installation as Readonly<Record<string, unknown>>
    : undefined;
  const [modId, setModId] = useState(initialMod?.id ?? '');
  const [name, setName] = useState(initialMod?.name ?? '');
  const [summary, setSummary] = useState(initialMod?.summary ?? '');
  const [targetPath, setTargetPath] = useState(typeof initialInstallation?.targetPath === 'string' ? initialInstallation.targetPath : '');
  const [targetInputMode, setTargetInputMode] = useState<'browse' | 'manual'>('browse');
  const [installationMode, setInstallationMode] = useState<'replace' | 'add-on'>(initialInstallation?.mode === 'add-on' ? 'add-on' : 'replace');
  const initialGame = snapshot.games.find((game) => game.id === initialMod?.gameId) ?? snapshot.games[0];
  const [gameId, setGameId] = useState(initialMod?.gameId ?? initialGame?.id ?? '');
  const [edition, setEdition] = useState(initialVersion?.gameEdition ?? initialGame?.edition ?? 'standard');
  const [version, setVersion] = useState(initialVersion?.version ?? '1.0.0');
  const [range, setRange] = useState(initialVersion?.gameVersionRange ?? '');
  const [adapter, setAdapter] = useState(initialVersion?.adapterId ?? 'generic-files');
  const [dependencies, setDependencies] = useState(Array.isArray(initialVersion?.manifest.dependencies) ? initialVersion.manifest.dependencies.filter((item): item is string => typeof item === 'string').join(', ') : '');
  const [conflicts, setConflicts] = useState(Array.isArray(initialVersion?.manifest.conflicts) ? initialVersion.manifest.conflicts.filter((item): item is string => typeof item === 'string').join(', ') : '');
  const [manifestText, setManifestText] = useState(initialVersion ? JSON.stringify(initialVersion.manifest, null, 2) : '{\n  "schemaVersion": 2,\n  "operations": []\n}');
  const [versionId, setVersionId] = useState<string | null>(initialVersion?.id ?? null);
  const [versionUpdatedAt, setVersionUpdatedAt] = useState<string | null>(initialVersion?.updatedAt ?? null);
  const [modContent, setModContent] = useState<PlanariaContentSelection | null>(null);
  const [imageFile, setImageFile] = useState<PlanariaFileSelection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showValidation, setShowValidation] = useState(false);
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
  const storedPackage = currentVersion ? snapshot.packages.find((item) => item.versionId === currentVersion.id) : undefined;
  const packageReady = Boolean(storedPackage?.verifiedAt);
  const existingImage = snapshot.media.find((item) => item.modId === modId && item.previewUrl);
  const draftValid = Boolean(parsedManifest && modId && name.trim() && gameId && targetPathValid);
  const publishValid = draftValid && currentVersion?.state === 'ready' && packageReady;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => { document.removeEventListener('keydown', handleKeyDown); window.cancelAnimationFrame(frame); };
  }, [onClose, pending]);

  const run = async (operation: () => Promise<void>) => {
    setPending(true); setError(''); setNotice('');
    try { await operation(); }
    catch { setError(t('planaria.requestFailed')); }
    finally { setPending(false); }
  };
  const choose = async (purpose: 'mod-image') => {
    try {
      const selected = await window.lyorPlanaria.selectFile(purpose);
      if (selected) {
        setImageFile(selected);
      }
    } catch { setError(t('planaria.requestFailed')); }
  };
  const chooseModContent = async (kind: 'file' | 'folder') => {
    try {
      const selected = await window.lyorPlanaria.selectModContent(kind);
      if (selected) setModContent(selected);
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
  const uploadModContent = () => run(async () => {
    if (!modContent || !versionId) throw new Error('missing');
    await window.lyorPlanaria.uploadModContent({ selectionId: modContent.id, versionId, modId, version });
    setModContent(null); await refresh();
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

  const attemptSave = () => {
    setShowValidation(true);
    if (!draftValid) return;
    void save();
  };

  return (
    <div className="planaria-modal" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
      <section aria-labelledby={titleId} aria-modal="true" className="planaria-upload-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="planaria-upload-dialog__header">
          <div><p className="planaria-eyebrow">{initialMod ? t('planaria.editMod') : t('planaria.newMod')}</p><h2 id={titleId}>{t('planaria.nav.upload')}</h2></div>
          <div>{currentVersion ? <span className={`planaria-state planaria-state--${currentVersion.state}`}>{t(stateKeys[currentVersion.state] ?? 'planaria.state.draft')}</span> : null}<button aria-label={t('planaria.closeUpload')} className="planaria-dialog-close" disabled={pending} onClick={onClose} type="button">×</button></div>
        </header>
        <div className="planaria-upload-dialog__body">
          <section className={`planaria-mod-hero-upload ${existingImage?.previewUrl ? 'has-preview' : ''}`}>
            <button aria-label={t('planaria.selectImage')} onClick={() => void choose('mod-image')} style={existingImage?.previewUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 28, .44), rgba(5, 12, 28, .58)), url("${existingImage.previewUrl}")` } : undefined} type="button">
              <span className="planaria-mod-hero-upload__icon" aria-hidden="true">＋</span>
              <strong>{imageFile?.name ?? (existingImage ? t('planaria.replaceImage') : t('planaria.heroImageTitle'))}</strong>
              <small>{imageFile ? `${imageFile.mimeType} · ${formatBytes(imageFile.size)}` : existingImage ? t('planaria.imagePreviewReady') : t('planaria.heroImageHint')}</small>
            </button>
            {imageFile ? <div className="planaria-image-actions"><button disabled={pending} onClick={() => setImageFile(null)} type="button">{t('planaria.removeSelection')}</button><button className="planaria-primary-button" disabled={pending || !versionId} onClick={() => void uploadImage()} type="button">{versionId ? t('planaria.uploadImage') : t('planaria.saveBeforeImage')}</button></div> : null}
          </section>
          <div className="planaria-form-grid planaria-form-grid--primary">
            <label>{t('planaria.modName')}<input autoFocus maxLength={160} onChange={(event) => { const next = event.target.value; setName(next); if (!modId) setModId(next.toLowerCase().trim().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 120)); }} value={name} />{showValidation && !name.trim() ? <small className="planaria-error">{t('planaria.requiredField')}</small> : null}</label>
            <GameCombobox games={snapshot.games} onChange={(game) => { setGameId(game.id); setEdition(game.edition); }} value={gameId} />
            <label className="planaria-field-wide">{t('planaria.summary')}<textarea maxLength={2000} onChange={(event) => setSummary(event.target.value)} placeholder={t('planaria.descriptionPlaceholder')} value={summary} /></label>
            <fieldset className="planaria-install-mode planaria-field-wide"><legend>{t('planaria.installMode')}</legend><div><button aria-pressed={installationMode === 'replace'} onClick={() => setInstallationMode('replace')} type="button"><strong>Replace</strong><small>{t('planaria.replaceHint')}</small></button><button aria-pressed={installationMode === 'add-on'} onClick={() => setInstallationMode('add-on')} type="button"><strong>Add-on</strong><small>{t('planaria.addOnHint')}</small></button></div></fieldset>
            <fieldset className="planaria-target-path planaria-field-wide"><legend>{t('planaria.targetPath')}</legend><div className="planaria-target-path__modes"><button aria-pressed={targetInputMode === 'browse'} onClick={() => void chooseTargetPath()} type="button">{t('planaria.targetPathBrowse')}</button><button aria-pressed={targetInputMode === 'manual'} onClick={() => setTargetInputMode('manual')} type="button">{t('planaria.targetPathManual')}</button></div><div className="planaria-path-input"><span aria-hidden="true">Game Root /</span>{targetInputMode === 'manual' ? <input aria-label={t('planaria.targetPathManualInput')} autoComplete="off" maxLength={1024} onChange={(event) => setTargetPath(event.target.value)} placeholder={t('planaria.targetPathPlaceholder')} value={targetPath} /> : <input aria-label={t('planaria.targetPathSelected')} placeholder={t('planaria.targetPathBrowsePlaceholder')} readOnly value={targetPath} />}</div><small className={targetPath && !targetPathValid ? 'planaria-error' : ''}>{targetPath && !targetPathValid ? t('planaria.targetPathInvalid') : targetInputMode === 'browse' ? t('planaria.targetPathBrowseHint') : t('planaria.targetPathHint')}</small>{showValidation && !targetPathValid ? <small className="planaria-error">{t('planaria.requiredDestination')}</small> : null}</fieldset>
          </div>
          <section className="planaria-content-picker">
            <div><span className="planaria-content-picker__icon" aria-hidden="true">⇧</span><div><h3>{t('planaria.modContent')}</h3><p>{t('planaria.modContentHint')}</p></div></div>
            <div className="planaria-inline-actions"><button className="planaria-secondary-button" onClick={() => void chooseModContent('file')} type="button">{t('planaria.selectModFile')}</button><button className="planaria-secondary-button" onClick={() => void chooseModContent('folder')} type="button">{t('planaria.selectModFolder')}</button></div>
            {modContent ? <div className="planaria-selection-summary"><div><strong>{modContent.name}</strong><span>{modContent.kind === 'folder' ? t('planaria.folder') : t('planaria.file')} · {modContent.fileCount} {t('planaria.files')}</span></div><strong>{formatBytes(modContent.size)}</strong><button aria-label={t('planaria.removeSelection')} onClick={() => setModContent(null)} type="button">×</button></div> : <p className="planaria-selection-empty">{packageReady && storedPackage ? `${t('planaria.packageVerified')} · ${formatBytes(storedPackage.byteSize)}` : t('planaria.noFilesSelected')}</p>}
            {modContent ? <button className="planaria-primary-button" disabled={pending || !versionId} onClick={() => void uploadModContent()} type="button">{versionId ? t('planaria.uploadModContent') : t('planaria.saveBeforeFiles')}</button> : null}
          </section>
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
          {progress && (progress.purpose === 'mod-content' || progress.purpose === 'mod-image') ? <div className="planaria-progress" aria-live="polite"><progress max={100} value={progress.percent} /><span>{Math.round(progress.percent)}% · {t(uploadStatusKeys[progress.status])}</span></div> : null}
          {showValidation && !draftValid ? <p className="planaria-validation-summary" role="alert">{t('planaria.completeRequiredFields')}</p> : null}
          {error ? <p className="planaria-error" role="alert">{error}</p> : null}{notice ? <p className="planaria-success" role="status">{notice}</p> : null}
        </div>
        <footer className="planaria-upload-dialog__footer">
          <button disabled={pending} onClick={onClose} type="button">{t('planaria.cancel')}</button>
          <div><button disabled={pending} onClick={attemptSave} type="button">{t('planaria.saveDraft')}</button>{currentVersion?.state === 'draft' ? <button disabled={pending || !packageReady} onClick={() => void transition('ready')} type="button">{t('planaria.markReady')}</button> : null}<button className="planaria-primary-button" disabled={pending || !publishValid} onClick={() => void transition('publish')} title={!publishValid ? t('planaria.publishRequirements') : undefined} type="button">{t('planaria.publish')}</button></div>
        </footer>
      </section>
    </div>
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
  const [uploadTargetId, setUploadTargetId] = useState<string | undefined>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSession, setUploadSession] = useState(0);
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
  const openUpload = (modId?: string) => {
    setUploadTargetId(modId);
    setUploadSession((current) => current + 1);
    setUploadOpen(true);
  };
  return (
    <div className="planaria-page">
      <header className="planaria-page__header"><div><p>{t('planaria.workspace')}</p><h1>{t('planaria.title')}</h1><span>{t('planaria.subtitle')}</span></div>{snapshot ? <span className="planaria-page__admin-badge"><i aria-hidden="true" />{snapshot.access.role}</span> : null}</header>
      <nav aria-label={t('planaria.title')} className="planaria-tabs">{(Object.keys(tabKeys) as PlanariaTab[]).map((id) => <button aria-current={id !== 'upload' && tab === id ? 'page' : undefined} key={id} onClick={() => { if (id === 'upload') openUpload(); else setTab(id); }} type="button">{t(tabKeys[id])}</button>)}</nav>
      {loading ? <div className="planaria-loading" role="status">{t('planaria.loading')}</div> : null}
      {error && !snapshot ? <div className="planaria-loading"><p className="planaria-error" role="alert">{error}</p><button onClick={() => void refresh()} type="button">{t('planaria.retry')}</button></div> : null}
      {snapshot ? <>{tab === 'overview' ? <Overview onUpload={openUpload} refresh={refresh} snapshot={snapshot} /> : null}{tab === 'mods' ? <ModManagement onUpload={openUpload} refresh={refresh} snapshot={snapshot} /> : null}{tab === 'billboards' ? <ManageBillboards items={snapshot.billboards} onRefresh={refresh} progress={progress} /> : null}{tab === 'admins' ? <AdminAccounts refresh={refresh} snapshot={snapshot} /> : null}{tab === 'releases' ? <ReleaseStatus /> : null}{uploadOpen ? <ModUpload initialModId={uploadTargetId} key={uploadSession} onClose={() => setUploadOpen(false)} progress={progress} refresh={refresh} snapshot={snapshot} /> : null}</> : null}
    </div>
  );
}
