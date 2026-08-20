import { useState } from 'react';

import { useI18n } from '../i18n/I18nContext';
import { mockInstallMod, mockUninstallMod, removeMockLibraryEntry, toggleMockFavorite } from '../services/mockModService';
import type { LibraryCardState, MockInstallPhase, Mod } from '../types/domain';
import { FavoriteButton } from './FavoriteButton';

interface ModCardProps {
  readonly favorite: boolean;
  readonly installPhase: MockInstallPhase;
  readonly installed: boolean;
  readonly libraryState?: LibraryCardState;
  readonly mod: Mod;
  readonly mode?: 'catalog' | 'library';
}

const stateKeys: Record<LibraryCardState, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  installed: 'library.state.installed',
  'not-installed': 'library.state.notInstalled',
  'update-available': 'library.state.updateAvailable',
  'needs-attention': 'library.state.needsAttention',
  'compatibility-unknown': 'library.state.compatibilityUnknown',
};

export function ModCard({ favorite, installPhase, installed, libraryState, mod, mode = 'catalog' }: ModCardProps) {
  const { t } = useI18n();
  const [uninstalling, setUninstalling] = useState(false);
  const [exiting, setExiting] = useState(false);
  const isLibrary = mode === 'library';
  const shouldUninstall = isLibrary && installed;
  const workflowBusy = installPhase === 'downloading' || installPhase === 'installing';

  const handleInstallAction = async () => {
    if (workflowBusy || uninstalling) return;
    if (shouldUninstall) {
      setUninstalling(true);
      try { await mockUninstallMod(mod.id); } finally { setUninstalling(false); }
    } else {
      await mockInstallMod(mod.id);
    }
  };

  const handleRemove = () => {
    setExiting(true);
    window.setTimeout(() => removeMockLibraryEntry(mod.id), 200);
  };

  const actionLabel = uninstalling
    ? t('action.uninstalling')
    : installPhase === 'downloading'
      ? t('action.downloading')
      : installPhase === 'installing'
        ? t('action.installing')
        : installPhase === 'success'
          ? t('action.success')
          : installPhase === 'failure'
            ? t('action.failed')
            : t(shouldUninstall ? 'action.uninstall' : 'action.install');

  return (
    <article className={`mod-card ${installed ? 'is-installed' : ''} ${exiting ? 'mod-card--exiting' : ''}`}>
      <img alt="" className="mod-card__cover" src={mod.imageSrc} />
      <h3 className="mod-card__name" title={mod.name}>{mod.name}</h3>
      <div className="mod-card__meta" aria-label={`${mod.downloads}, ${mod.fileSize}`}>
        <span><img alt="" aria-hidden="true" src="./assets/figma/card-icon-05.svg" />{mod.downloads}</span>
        <span><img alt="" aria-hidden="true" src="./assets/figma/card-icon-06.svg" />{mod.fileSize}</span>
      </div>
      <p className="mod-card__game">{mod.gameName}</p>
      {isLibrary && libraryState ? <p className={`mod-card__library-state mod-card__library-state--${libraryState}`}>{t(stateKeys[libraryState])}</p> : null}
      <p className="mod-card__description">{mod.description}</p>
      <div aria-hidden="true" className="mod-card__share"><img alt="" src="./assets/figma/card-icon-01.svg" /></div>
      <FavoriteButton active={favorite} className="mod-card__favorite" label={t(favorite ? 'action.removeFavorite' : 'action.addFavorite')} onClick={() => toggleMockFavorite(mod.id)} />
      {isLibrary ? <button aria-label={t('action.removeFromLibrary')} className="mod-card__remove" disabled={exiting} onClick={handleRemove} title={t('action.removeFromLibrary')} type="button">×</button> : null}
      <button className={`mod-card__action mod-card__action--${installPhase}`} disabled={workflowBusy || uninstalling || installPhase === 'success'} onClick={() => void handleInstallAction()} type="button">
        {installPhase === 'success' ? <span aria-hidden="true" className="success-check"><span /></span> : null}{actionLabel}
      </button>
    </article>
  );
}
