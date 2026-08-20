import type { MockInstallPhase, MockModState, Mod, ModId } from '../types/domain';

import { ModCard } from './ModCard';

interface ModGridProps {
  readonly emptyMessage: string;
  readonly mode?: 'catalog' | 'library';
  readonly mods: readonly Mod[];
  readonly phases: ReadonlyMap<ModId, MockInstallPhase>;
  readonly state: MockModState;
}

export function ModGrid({ emptyMessage, mode = 'catalog', mods, phases, state }: ModGridProps) {
  if (mods.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="mod-grid">
      {mods.map((mod) => (
        <ModCard
          favorite={state.favoriteModIds.includes(mod.id)}
          installPhase={phases.get(mod.id) ?? 'idle'}
          installed={state.installedModIds.includes(mod.id)}
          key={mod.id}
          mod={mod}
          libraryState={state.localInstallationState[mod.id]}
          mode={mode}
        />
      ))}
    </div>
  );
}
