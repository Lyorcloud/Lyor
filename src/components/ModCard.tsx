import { useState } from 'react';

import { useI18n } from '../i18n/I18nContext';
import { mockInstallMod, mockUninstallMod, toggleMockFavorite } from '../services/mockModService';
import type { Mod } from '../types/domain';
import { FavoriteButton } from './FavoriteButton';

interface ModCardProps {
  readonly favorite: boolean;
  readonly installed: boolean;
  readonly mod: Mod;
  readonly mode?: 'catalog' | 'library';
}

export function ModCard({ favorite, installed, mod, mode = 'catalog' }: ModCardProps) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const shouldUninstall = mode === 'library';

  const handleInstallAction = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      if (shouldUninstall) {
        await mockUninstallMod(mod.id);
      } else {
        await mockInstallMod(mod.id);
      }
    } finally {
      setPending(false);
    }
  };

  const actionLabel = pending
    ? t(shouldUninstall ? 'action.uninstalling' : 'action.installing')
    : t(shouldUninstall ? 'action.uninstall' : 'action.install');

  return (
    <article className={`mod-card ${installed ? 'is-installed' : ''}`}>
      <img alt="" className="mod-card__cover" src={mod.imageSrc} />
      <h3 className="mod-card__name" title={mod.name}>{mod.name}</h3>
      <div className="mod-card__meta" aria-label={`${mod.downloads}, ${mod.fileSize}`}>
        <span><img alt="" aria-hidden="true" src="./assets/figma/card-icon-05.svg" />{mod.downloads}</span>
        <span><img alt="" aria-hidden="true" src="./assets/figma/card-icon-06.svg" />{mod.fileSize}</span>
      </div>
      <p className="mod-card__game">{mod.gameName}</p>
      <p className="mod-card__description">{mod.description}</p>
      <div aria-hidden="true" className="mod-card__share">
        <img alt="" src="./assets/figma/card-icon-01.svg" />
      </div>
      <FavoriteButton
        active={favorite}
        className="mod-card__favorite"
        label={t(favorite ? 'action.removeFavorite' : 'action.addFavorite')}
        onClick={() => toggleMockFavorite(mod.id)}
      />
      <button
        className="mod-card__action"
        disabled={pending}
        onClick={() => void handleInstallAction()}
        type="button"
      >
        {actionLabel}
      </button>
    </article>
  );
}
