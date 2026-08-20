import type { Game } from '../types/domain';

import { GameButton } from './GameButton';
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
  readonly onToggle: () => void;
  readonly primaryNavigationLabel: string;
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
  onToggle,
  primaryNavigationLabel,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--closed'}`}>
      <img
        alt=""
        aria-hidden="true"
        className="sidebar__brand"
        src="./assets/lyor/sidebar-logo.png"
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
        <span aria-hidden="true" className="sidebar__toggle-icon">❮</span>
      </button>
    </aside>
  );
}
