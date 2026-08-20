import type { Game, GameId } from '../types/domain';

/**
 * Typed local game data based on the titles visible in the Figma source.
 * The first six entries are the games shown in the sidebar reference.
 */
export const mockGames = [
  {
    id: 'spider-man-2',
    name: 'Spider-Man 2',
    aliases: ['Spider Man 2', 'SM2', 'Marvel Spider-Man 2'],
    platform: 'steam',
    imageSrc: './assets/figma/game-spider-man-2.png',
  },
  {
    id: 'resident-evil-4-remake',
    name: 'Resident Evil 4 Remake',
    aliases: ['Resident Evil 4', 'RE4', 'RE4 Remake'],
    platform: 'epic-games',
    imageSrc: './assets/figma/game-resident-evil-4.png',
  },
  {
    id: 'grand-theft-auto-v',
    name: 'Grand Theft Auto V',
    aliases: ['Grand Theft Auto 5', 'GTA 5', 'GTA V', 'GTAV'],
    platform: 'rockstar-games',
    imageSrc: './assets/figma/game-gta-v.png',
  },
  {
    id: 'red-dead-redemption-2',
    name: 'Red Dead Redemption 2',
    aliases: ['Red Dead 2', 'RDR 2', 'RDR2'],
    platform: 'rockstar-games',
    imageSrc: './assets/figma/game-rdr2.png',
  },
  {
    id: 'hell-is-us',
    name: 'Hell is Us',
    aliases: ['Hell Is Us', 'HIU'],
    platform: 'epic-games',
    imageSrc: './assets/figma/game-hell-is-us.png',
  },
  {
    id: 'elden-ring',
    name: 'Elden Ring',
    aliases: ['ER'],
    platform: 'xbox',
    imageSrc: './assets/figma/game-elden-ring.png',
  },
  {
    id: 'spider-man-remastered',
    name: 'Spider-Man Remastered',
    aliases: ['Spider Man Remastered', 'Marvel Spider-Man Remastered', 'SMR'],
    platform: 'steam',
    imageSrc: './assets/figma/game-spider-man-2.png',
  },
  {
    id: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    aliases: ['Cyberpunk', 'CP2077'],
    platform: 'steam',
    imageSrc: './assets/figma/mod-tweak-xl.png',
  },
] as const satisfies readonly Game[];

export const mockSidebarGames: readonly Game[] = mockGames.slice(0, 6);

const gamesById = new Map<GameId, Game>(
  mockGames.map((game) => [game.id, game] as const),
);

export function getMockGameById(gameId: GameId): Game {
  const game = gamesById.get(gameId);

  if (!game) {
    throw new Error(`Unknown mock game: ${gameId}`);
  }

  return game;
}
