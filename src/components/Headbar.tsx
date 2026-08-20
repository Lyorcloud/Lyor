import type { ChangeEventHandler, FocusEventHandler } from 'react';

import { FavoriteButton } from './FavoriteButton';
import { SearchBar } from './SearchBar';

interface HeadbarProps {
  readonly favoritesLabel: string;
  readonly onFavorites: () => void;
  readonly onSearchChange: ChangeEventHandler<HTMLInputElement>;
  readonly onSearchFocus: FocusEventHandler<HTMLInputElement>;
  readonly onSettings: () => void;
  readonly searchPlaceholder: string;
  readonly searchValue: string;
  readonly settingsLabel: string;
}

export function Headbar({
  favoritesLabel,
  onFavorites,
  onSearchChange,
  onSearchFocus,
  onSettings,
  searchPlaceholder,
  searchValue,
  settingsLabel,
}: HeadbarProps) {
  return (
    <div className="headbar">
      <div className="headbar__center" data-no-drag>
        <button
          aria-label={settingsLabel}
          className="headbar__icon-button headbar__settings"
          data-no-drag
          onClick={onSettings}
          type="button"
        >
          <img alt="" aria-hidden="true" src="./assets/figma/head-icon-04.svg" />
        </button>
        <SearchBar
          onChange={onSearchChange}
          onFocus={onSearchFocus}
          placeholder={searchPlaceholder}
          value={searchValue}
        />
        <FavoriteButton
          className="headbar__favorite"
          label={favoritesLabel}
          onClick={onFavorites}
          variant="headbar"
        />
      </div>
    </div>
  );
}
