import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { HomeBillboard } from './components/HomeBillboard';
import { ModGrid } from './components/ModGrid';
import { SortPopover, type SortOption } from './components/SortPopover';
import { Sidebar, type PrimaryRoute } from './components/Sidebar';
import { SettingsPage } from './components/settings/SettingsPage';
import { TitleBar } from './components/TitleBar';
import { UpdateOverlay } from './components/UpdateBanner';
import { WindowShell } from './components/WindowShell';
import { AuthPanel } from './components/AuthPanel';
import { PlanariaPage } from './components/PlanariaPage';
import { PlanariaAuthPanel } from './components/PlanariaAuthPanel';
import { mockMods } from './data/mockMods';
import type { HomeBillboardItem } from './data/mockBillboards';
import { mockSidebarGames } from './data/mockGames';
import { useMockInstallPhases, useMockModState } from './hooks/useMockModState';
import { useAuth } from './hooks/useAuth';
import { usePlanariaAuth } from './hooks/usePlanariaAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { useI18n } from './i18n/I18nContext';
import { searchMockMods } from './services/mockModService';
import { sortFavoriteMods, sortHomeMods, sortLibraryMods, type FavoritesSortId, type HomeSortId, type LibrarySortId } from './services/modSortService';

type AppRoute = PrimaryRoute | 'favorites' | 'search' | 'settings' | 'planaria';

const routes = new Set<AppRoute>(['home', 'library', 'mods', 'favorites', 'search', 'settings', 'planaria']);

function routeFromHash(): AppRoute {
  const candidate = window.location.hash.slice(1) as AppRoute;
  return routes.has(candidate) ? candidate : 'home';
}

function navigateTo(route: AppRoute): void {
  if (window.location.hash !== `#${route}`) {
    window.location.hash = route;
  }
}

export default function App() {
  const { t } = useI18n();
  const mockState = useMockModState();
  const installPhases = useMockInstallPhases();
  const auth = useAuth();
  const planariaAuth = usePlanariaAuth();
  const cloudSync = useCloudSync(auth.state.status);
  const [authOpen, setAuthOpen] = useState(false);
  const [planariaAuthOpen, setPlanariaAuthOpen] = useState(false);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [homeSort, setHomeSort] = useState<HomeSortId>('recommended');
  const [librarySort, setLibrarySort] = useState<LibrarySortId>('recently-installed');
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSortId>('recently-added');
  const [billboards, setBillboards] = useState<readonly HomeBillboardItem[]>([]);
  const contentScrollRef = useRef<HTMLElement>(null);
  const routeRef = useRef<AppRoute>(route);
  const scrollPositionsRef = useRef<Map<AppRoute, number>>(new Map());

  const handleNavigate = (nextRoute: AppRoute) => {
    if (nextRoute !== 'search') {
      setSearchQuery('');
    }
    navigateTo(nextRoute);
  };

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#home');
    }
    const handleHashChange = () => {
      const scroller = contentScrollRef.current;
      if (scroller) {
        scrollPositionsRef.current.set(routeRef.current, scroller.scrollTop);
      }

      const nextRoute = routeFromHash();
      routeRef.current = nextRoute;
      setRoute(nextRoute);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useLayoutEffect(() => {
    const scroller = contentScrollRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollTop = scrollPositionsRef.current.get(route) ?? 0;
  }, [route]);

  const planariaAvailable = planariaAuth.state.status === 'authenticated' &&
    (planariaAuth.state.user?.role === 'admin' || planariaAuth.state.user?.role === 'super_admin');

  useEffect(() => {
    if (route === 'planaria' && !planariaAvailable) navigateTo('home');
  }, [planariaAvailable, route]);

  useEffect(() => {
    if (route !== 'home' || !window.lyorPlanaria) return;
    let active = true;
    void window.lyorPlanaria.getPublicBillboards()
      .then((items) => { if (active) setBillboards(items); })
      .catch(() => { if (active) setBillboards([]); });
    return () => { active = false; };
  }, [route]);

  const visibleMods = useMemo(() => {
    if (route === 'library') {
      const libraryIds = new Set(mockState.libraryEntries.map((entry) => entry.modId));
      return sortLibraryMods(mockMods.filter((mod) => libraryIds.has(mod.id)), mockState.libraryEntries, librarySort);
    }
    if (route === 'favorites') {
      return sortFavoriteMods(mockMods.filter((mod) => mockState.favoriteModIds.includes(mod.id)), mockState.favoriteAddedAt, favoritesSort);
    }
    if (route === 'search') {
      return searchMockMods(searchQuery);
    }
    return route === 'home' ? sortHomeMods(mockMods, homeSort) : mockMods;
  }, [favoritesSort, homeSort, librarySort, mockState.favoriteAddedAt, mockState.favoriteModIds, mockState.libraryEntries, route, searchQuery]);

  const sectionTitle = route === 'home'
    ? t('section.topMods')
    : route === 'mods'
      ? t('section.allMods')
      : route === 'library'
        ? t('section.library')
        : route === 'favorites'
          ? t('section.favorites')
          : route === 'search'
            ? t('section.searchResults')
            : route === 'planaria' ? t('planaria.title') : t('nav.settings');

  const emptyMessage = route === 'library'
    ? t('empty.library')
    : route === 'favorites'
      ? t('empty.favorites')
      : t('empty.search');

  const homeSortOptions: readonly SortOption<HomeSortId>[] = [
    { id: 'recommended', label: t('sort.recommended') }, { id: 'newest', label: t('sort.newest') },
    { id: 'most-popular', label: t('sort.mostPopular') }, { id: 'most-downloaded', label: t('sort.mostDownloaded') },
  ];
  const librarySortOptions: readonly SortOption<LibrarySortId>[] = [
    { id: 'recently-installed', label: t('sort.recentlyInstalled') }, { id: 'first-installed', label: t('sort.firstInstalled') },
    { id: 'file-size-desc', label: t('sort.fileSizeDesc') },
  ];
  const favoriteSortOptions: readonly SortOption<FavoritesSortId>[] = [
    { id: 'recently-added', label: t('sort.recentlyAdded') }, { id: 'most-popular', label: t('sort.mostPopular') }, { id: 'newest', label: t('sort.newest') },
  ];

  const sortControl = route === 'home'
    ? <SortPopover label={t('sort.label')} onChange={setHomeSort} options={homeSortOptions} value={homeSort} />
    : route === 'library'
      ? <SortPopover label={t('sort.label')} onChange={setLibrarySort} options={librarySortOptions} value={librarySort} />
      : route === 'favorites'
        ? <SortPopover label={t('sort.label')} onChange={setFavoritesSort} options={favoriteSortOptions} value={favoritesSort} />
        : null;

  return (
    <WindowShell
      contentRef={contentScrollRef}
      sidebar={(
        <Sidebar
          activeRoute={route}
          collapseLabel={t('action.collapseSidebar')}
          expandLabel={t('action.expandSidebar')}
          games={mockSidebarGames}
          gamesLabel={t('section.games')}
          isOpen={sidebarOpen}
          labels={{ home: t('nav.home'), library: t('nav.library'), mods: t('nav.mods') }}
          onNavigate={handleNavigate}
          onProductSelect={(product) => {
            if (product === 'lyor') handleNavigate('home');
            else if (planariaAvailable) handleNavigate('planaria');
            else setPlanariaAuthOpen(true);
          }}
          onToggle={() => setSidebarOpen((current) => !current)}
          primaryNavigationLabel={t('aria.primaryNavigation')}
          productSwitcherLabel={t('product.switcher')}
          productUnavailableLabel={t('product.unavailable')}
          planariaAvailable
        />
      )}
      sidebarOpen={sidebarOpen}
      titleBar={(
        <TitleBar
          accountLabel={auth.state.user ? t('auth.account') : t('auth.signIn')}
          closeLabel={t('window.close')}
          favoritesLabel={t('nav.favorites')}
          maximizeLabel={t('window.maximize')}
          minimizeLabel={t('window.minimize')}
          onFavorites={() => handleNavigate('favorites')}
          onAccount={() => setAuthOpen(true)}
          onSearchChange={(event) => {
            setSearchQuery(event.target.value);
            if (event.target.value) navigateTo('search');
          }}
          onSearchBlur={() => setSearchFocused(false)}
          onSearchFocus={() => setSearchFocused(true)}
          onSettings={() => handleNavigate('settings')}
          restoreLabel={t('window.restore')}
          searchPlaceholder={t('search.placeholder')}
          searchValue={searchQuery}
          settingsLabel={t('nav.settings')}
          windowControlsLabel={t('aria.windowControls')}
        />
      )}
    >
      <UpdateOverlay />
      {auth.state.status === 'authenticated' && (cloudSync.status === 'offline' || cloudSync.status === 'partial' || cloudSync.pendingOperations > 0) ? (
        <div aria-live="polite" className={`cloud-sync-banner cloud-sync-banner--${cloudSync.status}`}>
          {cloudSync.status === 'offline'
            ? t('cloud.offline')
            : cloudSync.status === 'partial'
              ? t('cloud.partial')
              : t('cloud.pending', { count: cloudSync.pendingOperations })}
        </div>
      ) : null}
      {authOpen ? (
        <AuthPanel
          forgotPassword={auth.forgotPassword}
          login={auth.login}
          logout={auth.logout}
          onClose={closeAuth}
          open
          pending={auth.pending}
          register={auth.register}
          state={auth.state}
          updatePassword={auth.updatePassword}
        />
      ) : null}
      {planariaAuthOpen ? (
        <PlanariaAuthPanel
          login={planariaAuth.login}
          onClose={() => setPlanariaAuthOpen(false)}
          onSuccess={() => { setPlanariaAuthOpen(false); navigateTo('planaria'); }}
          pending={planariaAuth.pending}
          state={planariaAuth.state}
        />
      ) : null}
      <section className={`content-section content-section--${route}`}>
        <div className="route-content" key={route}>
          {route === 'home' ? <HomeBillboard fallbackLabel={t('billboard.fallback')} hidden={searchFocused} items={billboards} nextLabel={t('billboard.next')} previousLabel={t('billboard.previous')} /> : null}
          {route === 'planaria' ? <PlanariaPage /> : null}
          {route !== 'planaria' ? (
          <>
          <div className="section-heading">
            <h1>{sectionTitle}</h1>
            <span />
            {sortControl}
          </div>
          {route !== 'settings' ? (
            <ModGrid
              emptyMessage={emptyMessage}
              mode={route === 'library' ? 'library' : 'catalog'}
              mods={visibleMods}
              phases={installPhases}
              state={mockState}
            />
          ) : <SettingsPage />}
          </>
          ) : null}
        </div>
      </section>
    </WindowShell>
  );
}
