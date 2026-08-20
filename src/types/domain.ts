export const GAME_IDS = [
  'spider-man-2',
  'resident-evil-4-remake',
  'grand-theft-auto-v',
  'red-dead-redemption-2',
  'hell-is-us',
  'elden-ring',
  'spider-man-remastered',
  'cyberpunk-2077',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export const PLATFORM_IDS = [
  'steam',
  'epic-games',
  'xbox',
  'rockstar-games',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const MOD_IDS = [
  'rampage-trainer-rdr2',
  'rampage-trainer-gta-v',
  'modding-tools-spider-man-remastered',
  'tweak-xl-cyberpunk-2077',
  'reframework-resident-evil-4-remake',
  'script-hook-v-gta-v',
  'simple-trainer-rdr2',
  'seamless-co-op-elden-ring',
] as const;

export type ModId = (typeof MOD_IDS)[number];

export type ModKind = 'mod' | 'tool' | 'trainer';

export interface Game {
  readonly id: GameId;
  readonly name: string;
  readonly aliases: readonly string[];
  /** Storefront/platform source for the game's local platform mark. */
  readonly platform: PlatformId;
  /** Local renderer URL. Assets are copied from Figma into public/assets/figma. */
  readonly imageSrc: `./assets/figma/${string}`;
}

export interface Mod {
  readonly id: ModId;
  readonly name: string;
  readonly gameId: GameId;
  readonly gameName: string;
  readonly aliases: readonly string[];
  readonly kind: ModKind;
  /** Preformatted mock metadata shown by the Figma card. */
  readonly downloads: string;
  readonly fileSize: string;
  readonly description: string;
  /** Local renderer URL. Never points at Figma's temporary asset host. */
  readonly imageSrc: `./assets/figma/${string}`;
}

export type MockInstallStatus = 'available' | 'installed';

export interface MockModState {
  readonly installedModIds: readonly ModId[];
  readonly favoriteModIds: readonly ModId[];
}

export type MockModOperation = 'install' | 'uninstall';

export interface MockModOperationResult {
  readonly modId: ModId;
  readonly operation: MockModOperation;
  readonly status: MockInstallStatus;
  /** False when the requested state had already been reached. */
  readonly changed: boolean;
}
