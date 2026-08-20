import type { Game, PlatformId } from '../types/domain';

interface GameButtonProps {
  readonly game: Game;
}

const platformLogos: Readonly<Record<PlatformId, { readonly label: string; readonly src: string }>> = {
  steam: { label: 'Steam', src: './assets/platforms/steam.svg' },
  'epic-games': { label: 'Epic Games', src: './assets/platforms/epic-games.svg' },
  xbox: { label: 'Xbox / Microsoft Store', src: './assets/platforms/xbox.svg' },
  'rockstar-games': { label: 'Rockstar Games', src: './assets/platforms/rockstar-games.svg' },
};

export function GameButton({ game }: GameButtonProps) {
  const platform = platformLogos[game.platform];

  return (
    <div className="game-button" title={game.name}>
      <img alt="" aria-hidden="true" className="game-button__image" src={game.imageSrc} />
      <span className="game-button__name">{game.name}</span>
      <img alt={platform.label} className="game-button__platform-logo" src={platform.src} />
    </div>
  );
}
