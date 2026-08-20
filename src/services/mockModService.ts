import { mockGames } from '../data/mockGames';
import { mockMods } from '../data/mockMods';
import {
  MOD_IDS,
  type GameId,
  type MockModOperationResult,
  type MockModState,
  type Mod,
  type ModId,
} from '../types/domain';

export const MOCK_MOD_STORAGE_KEY = 'lyor.mock-mod-state.v1';

type MockModStateListener = () => void;

const listeners = new Set<MockModStateListener>();
const knownModIds = new Set<string>(MOD_IDS);
const modOrder = new Map<ModId, number>(
  MOD_IDS.map((id, index) => [id, index] as const),
);

let stateSnapshot: MockModState | undefined;

function isModId(value: unknown): value is ModId {
  return typeof value === 'string' && knownModIds.has(value);
}

function normalizeIds(value: unknown): readonly ModId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Object.freeze(
    [...new Set(value.filter(isModId))].sort(
      (left, right) => (modOrder.get(left) ?? 0) - (modOrder.get(right) ?? 0),
    ),
  );
}

function freezeState(
  installedModIds: unknown,
  favoriteModIds: unknown,
): MockModState {
  return Object.freeze({
    installedModIds: normalizeIds(installedModIds),
    favoriteModIds: normalizeIds(favoriteModIds),
  });
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    // Electron can deny storage in unusual sessions. The in-memory fallback keeps
    // this explicitly mock service usable without escalating to filesystem IPC.
    return undefined;
  }
}

function readStoredState(): MockModState {
  const storage = getLocalStorage();

  if (!storage) {
    return freezeState([], []);
  }

  try {
    const storedValue: unknown = JSON.parse(storage.getItem(MOCK_MOD_STORAGE_KEY) ?? 'null');

    if (storedValue && typeof storedValue === 'object') {
      const candidate = storedValue as Partial<MockModState>;
      return freezeState(candidate.installedModIds, candidate.favoriteModIds);
    }
  } catch {
    // Ignore malformed or unavailable local data and start from a safe empty state.
  }

  return freezeState([], []);
}

function persistState(state: MockModState): void {
  try {
    getLocalStorage()?.setItem(MOCK_MOD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The memory snapshot remains authoritative for the current renderer session.
  }
}

function publishState(nextState: MockModState): void {
  stateSnapshot = nextState;
  persistState(nextState);
  listeners.forEach((listener) => listener());
}

function requireMockMod(modId: ModId): Mod {
  const mod = mockMods.find((candidate) => candidate.id === modId);

  if (!mod) {
    throw new Error(`Unknown mock mod: ${modId}`);
  }

  return mod;
}

function updateIdList(
  list: readonly ModId[],
  modId: ModId,
  shouldContain: boolean,
): readonly ModId[] {
  const containsMod = list.includes(modId);

  if (containsMod === shouldContain) {
    return list;
  }

  return shouldContain
    ? normalizeIds([...list, modId])
    : Object.freeze(list.filter((candidate) => candidate !== modId));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const searchableTextByModId = new Map<ModId, string>(
  mockMods.map((mod) => {
    const game = mockGames.find((candidate) => candidate.id === mod.gameId);
    const searchableFields = [
      mod.name,
      ...mod.aliases,
      mod.gameName,
      game?.name ?? '',
      ...(game?.aliases ?? []),
    ];

    return [mod.id, normalizeSearchText(searchableFields.join(' '))] as const;
  }),
);

/** Returns every mod for a blank query; all other terms must match. */
export function searchMockMods(query: string): readonly Mod[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return mockMods;
  }

  return mockMods.filter((mod) => {
    const searchableText = searchableTextByModId.get(mod.id) ?? '';
    return terms.every((term) => searchableText.includes(term));
  });
}

export function getMockModsForGame(gameId: GameId): readonly Mod[] {
  return mockMods.filter((mod) => mod.gameId === gameId);
}

export function getMockModById(modId: ModId): Mod {
  return requireMockMod(modId);
}

/** Stable snapshot suitable for React.useSyncExternalStore. */
export function getMockModState(): MockModState {
  stateSnapshot ??= readStoredState();
  return stateSnapshot;
}

export function subscribeToMockModState(listener: MockModStateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isMockModInstalled(modId: ModId): boolean {
  return getMockModState().installedModIds.includes(modId);
}

export function isMockModFavorite(modId: ModId): boolean {
  return getMockModState().favoriteModIds.includes(modId);
}

/**
 * Renderer-only state transition for UI testing. It never calls preload, IPC, or
 * any filesystem API and must not be mistaken for the future install engine.
 */
export async function mockInstallMod(modId: ModId): Promise<MockModOperationResult> {
  requireMockMod(modId);
  const currentState = getMockModState();
  const installedModIds = updateIdList(currentState.installedModIds, modId, true);
  const changed = installedModIds !== currentState.installedModIds;

  if (changed) {
    publishState(freezeState(installedModIds, currentState.favoriteModIds));
  }

  return { modId, operation: 'install', status: 'installed', changed };
}

/** Renderer-only mock transition; no game or application files are touched. */
export async function mockUninstallMod(modId: ModId): Promise<MockModOperationResult> {
  requireMockMod(modId);
  const currentState = getMockModState();
  const installedModIds = updateIdList(currentState.installedModIds, modId, false);
  const changed = installedModIds !== currentState.installedModIds;

  if (changed) {
    publishState(freezeState(installedModIds, currentState.favoriteModIds));
  }

  return { modId, operation: 'uninstall', status: 'available', changed };
}

export function setMockFavorite(modId: ModId, favorite: boolean): MockModState {
  requireMockMod(modId);
  const currentState = getMockModState();
  const favoriteModIds = updateIdList(currentState.favoriteModIds, modId, favorite);

  if (favoriteModIds !== currentState.favoriteModIds) {
    publishState(freezeState(currentState.installedModIds, favoriteModIds));
  }

  return getMockModState();
}

export function toggleMockFavorite(modId: ModId): MockModState {
  return setMockFavorite(modId, !isMockModFavorite(modId));
}

export function getMockInstalledMods(): readonly Mod[] {
  const installedIds = new Set(getMockModState().installedModIds);
  return mockMods.filter((mod) => installedIds.has(mod.id));
}

export function getMockFavoriteMods(): readonly Mod[] {
  const favoriteIds = new Set(getMockModState().favoriteModIds);
  return mockMods.filter((mod) => favoriteIds.has(mod.id));
}
