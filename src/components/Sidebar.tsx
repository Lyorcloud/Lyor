import type { Game } from '../types/domain';

import { GameButton } from './GameButton';
import { ProductSwitcher, type ProductDestination } from './ProductSwitcher';
import { SidebarArrow } from './SidebarArrow';
import { SidebarNavButton } from './SidebarNavButton';

export type PrimaryRoute = 'home' | 'library' | 'mods';

interface SidebarProps {
  readonly activeRoute: string;
  readonly collapseLabel: string;
  readonly expandLabel: string;
  readonly games: readonly Game[];
  readonly gamesLabel: string;
  readonly isOpen: boolean;
  readonly labels: Record<PrimaryRoute, string>;
  readonly onNavigate: (route: PrimaryRoute) => void;
  readonly onProductSelect: (product: 'lyor' | 'planaria') => void;
  readonly onToggle: () => void;
  readonly primaryNavigationLabel: string;
  readonly productSwitcherLabel: string;
  readonly productUnavailableLabel: string;
  readonly planariaAvailable: boolean;
}

const routes: readonly PrimaryRoute[] = ['home', 'library', 'mods'];

export function Sidebar({
  activeRoute,
  collapseLabel,
  expandLabel,
  games,
  gamesLabel,
  isOpen,
  labels,
  onNavigate,
  onProductSelect,
  onToggle,
  primaryNavigationLabel,
  productSwitcherLabel,
  productUnavailableLabel,
  planariaAvailable,
}: SidebarProps) {
  const destinations: readonly ProductDestination[] = [
    { available: true, description: 'Discover, install, play', id: 'lyor', label: 'Lyor' },
    { available: planariaAvailable, description: 'Create, Manage, Publish', id: 'planaria', label: 'Planaria' },
  ];
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--closed'}`}>
      <ProductSwitcher
        currentLabel={activeRoute === 'planaria' ? 'Planaria' : 'Lyor'}
        currentProductId={activeRoute === 'planaria' ? 'planaria' : 'lyor'}
        destinations={destinations}
        label={productSwitcherLabel}
        onSelect={(destination) => {
          if (!destination.available) {
            window.dispatchEvent(new CustomEvent('lyor:product-unavailable', { detail: destination.id }));
          } else {
            onProductSelect(destination.id);
          }
        }}
        unavailableLabel={productUnavailableLabel}
        visible={isOpen}
      />
      <div
        aria-hidden={!isOpen}
        className="sidebar__expanded-content"
        id="sidebar-expanded-content"
        inert={!isOpen}
      >
        <nav aria-label={primaryNavigationLabel} className="sidebar__nav">
          {routes.map((route) => (
            <SidebarNavButton
              active={activeRoute === route}
              key={route}
              label={labels[route]}
              onClick={() => onNavigate(route)}
            />
          ))}
        </nav>
        <section aria-label={gamesLabel} className="sidebar__games">
          <h2>{gamesLabel}</h2>
          <div className="sidebar__game-list">
            {games.map((game) => (
              <GameButton game={game} key={game.id} />
            ))}
          </div>
        </section>
      </div>
      <button
        aria-controls="sidebar-expanded-content"
        aria-expanded={isOpen}
        aria-label={isOpen ? collapseLabel : expandLabel}
        className="sidebar__toggle"
        onClick={onToggle}
        title={isOpen ? collapseLabel : expandLabel}
        type="button"
      >
        <span className="sidebar__toggle-icon"><SidebarArrow /></span>
      </button>
    </aside>
  );
}
