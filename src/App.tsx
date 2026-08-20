import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { HomeBillboard, type HomeBillboardItem } from './components/HomeBillboard';
import { ModGrid } from './components/ModGrid';
import { Sidebar, type PrimaryRoute } from './components/Sidebar';
import { SettingsPage } from './components/settings/SettingsPage';
import { TitleBar } from './components/TitleBar';
import { UpdateOverlay } from './components/UpdateBanner';
import { WindowShell } from './components/WindowShell';
import { mockMods } from './data/mockMods';
import { mockSidebarGames } from './data/mockGames';
import { useMockModState } from './hooks/useMockModState';
import { useI18n } from './i18n/I18nContext';
import { searchMockMods } from './services/mockModService';

type AppRoute = PrimaryRoute | 'favorites' | 'search' | 'settings';

const routes = new Set<AppRoute>(['home', 'library', 'mods', 'favorites', 'search', 'settings']);

const homeBillboards: readonly HomeBillboardItem[] = [
  {
    alt: 'Lyor Coming Hardcore',
    id: 'lyor-coming-hardcore',
    imageSrc: './assets/lyor/home-billboard.png',
  },
];

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
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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

  const visibleMods = useMemo(() => {
    if (route === 'library') {
      return mockMods.filter((mod) => mockState.installedModIds.includes(mod.id));
    }
    if (route === 'favorites') {
      return mockMods.filter((mod) => mockState.favoriteModIds.includes(mod.id));
    }
    if (route === 'search') {
      return searchMockMods(searchQuery);
    }
    return mockMods;
  }, [mockState.favoriteModIds, mockState.installedModIds, route, searchQuery]);

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
            : t('nav.settings');

  const emptyMessage = route === 'library'
    ? t('empty.library')
    : route === 'favorites'
      ? t('empty.favorites')
      : t('empty.search');

  const handleSearchFocus = () => navigateTo('search');

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
          onToggle={() => setSidebarOpen((current) => !current)}
          primaryNavigationLabel={t('aria.primaryNavigation')}
        />
      )}
      sidebarOpen={sidebarOpen}
      titleBar={(
        <TitleBar
          closeLabel={t('window.close')}
          favoritesLabel={t('nav.favorites')}
          maximizeLabel={t('window.maximize')}
          minimizeLabel={t('window.minimize')}
          onFavorites={() => handleNavigate('favorites')}
          onSearchChange={(event) => {
            setSearchQuery(event.target.value);
            navigateTo('search');
          }}
          onSearchFocus={handleSearchFocus}
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
      <section className={`content-section content-section--${route}`}>
        <div className="route-content" key={route}>
          {route === 'home' ? <HomeBillboard items={homeBillboards} /> : null}
          <div className="section-heading">
            <h1>{sectionTitle}</h1>
            <span />
          </div>
          {route !== 'settings' ? (
            <ModGrid
              emptyMessage={emptyMessage}
              mode={route === 'library' ? 'library' : 'catalog'}
              mods={visibleMods}
              state={mockState}
            />
          ) : <SettingsPage />}
        </div>
      </section>
    </WindowShell>
  );
}
