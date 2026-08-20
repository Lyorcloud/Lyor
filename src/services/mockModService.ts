import { mockGames } from '../data/mockGames';
import { mockMods } from '../data/mockMods';
import { MOD_IDS, type GameId, type LibraryCardState, type MockCloudLibraryEntry, type MockInstallPhase, type MockModOperationResult, type MockModState, type Mod, type ModId } from '../types/domain';

export const MOCK_MOD_STORAGE_KEY = 'lyor.mock-mod-state.v2';
const LEGACY_STORAGE_KEY = 'lyor.mock-mod-state.v1';
const DEFAULT_LIBRARY: readonly MockCloudLibraryEntry[] = Object.freeze([
  { modId: 'rampage-trainer-rdr2', addedAt: '2026-08-01T10:00:00.000Z', installedAt: '2026-08-02T10:00:00.000Z' },
  { modId: 'rampage-trainer-gta-v', addedAt: '2026-07-27T10:00:00.000Z' },
  { modId: 'modding-tools-spider-man-remastered', addedAt: '2026-07-20T10:00:00.000Z', installedAt: '2026-07-21T10:00:00.000Z' },
  { modId: 'tweak-xl-cyberpunk-2077', addedAt: '2026-07-12T10:00:00.000Z' },
  { modId: 'reframework-resident-evil-4-remake', addedAt: '2026-06-30T10:00:00.000Z' },
]);
const DEFAULT_LOCAL_STATES: Readonly<Partial<Record<ModId, LibraryCardState>>> = Object.freeze({
  'rampage-trainer-rdr2': 'installed',
  'rampage-trainer-gta-v': 'not-installed',
  'modding-tools-spider-man-remastered': 'update-available',
  'tweak-xl-cyberpunk-2077': 'needs-attention',
  'reframework-resident-evil-4-remake': 'compatibility-unknown',
});

type Listener = () => void;
const listeners = new Set<Listener>();
const workflowListeners = new Set<Listener>();
const knownModIds = new Set<string>(MOD_IDS);
const modOrder = new Map<ModId, number>(MOD_IDS.map((id, index) => [id, index]));
const workflowPhases = new Map<ModId, MockInstallPhase>();
let workflowSnapshot: ReadonlyMap<ModId, MockInstallPhase> = new Map();
let stateSnapshot: MockModState | undefined;

function isModId(value: unknown): value is ModId { return typeof value === 'string' && knownModIds.has(value); }
function normalizeIds(value: unknown): readonly ModId[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze([...new Set(value.filter(isModId))].sort((a, b) => (modOrder.get(a) ?? 0) - (modOrder.get(b) ?? 0)));
}
function isLibraryState(value: unknown): value is LibraryCardState {
  return ['installed', 'not-installed', 'update-available', 'needs-attention', 'compatibility-unknown'].includes(String(value));
}
function normalizeEntries(value: unknown): readonly MockCloudLibraryEntry[] {
  if (!Array.isArray(value)) return DEFAULT_LIBRARY;
  const entries = value.flatMap((candidate): MockCloudLibraryEntry[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const entry = candidate as Partial<MockCloudLibraryEntry>;
    if (!isModId(entry.modId) || typeof entry.addedAt !== 'string') return [];
    return [{ modId: entry.modId, addedAt: entry.addedAt, installedAt: typeof entry.installedAt === 'string' ? entry.installedAt : undefined }];
  });
  return Object.freeze(entries.sort((a, b) => (modOrder.get(a.modId) ?? 0) - (modOrder.get(b.modId) ?? 0)));
}
function normalizeFavoriteDates(value: unknown): Readonly<Partial<Record<ModId, string>>> {
  if (!value || typeof value !== 'object') return Object.freeze({});
  const result: Partial<Record<ModId, string>> = {};
  for (const [key, date] of Object.entries(value)) if (isModId(key) && typeof date === 'string') result[key] = date;
  return Object.freeze(result);
}
function normalizeLocalStates(value: unknown): Readonly<Partial<Record<ModId, LibraryCardState>>> {
  if (!value || typeof value !== 'object') return DEFAULT_LOCAL_STATES;
  const result: Partial<Record<ModId, LibraryCardState>> = {};
  for (const [key, state] of Object.entries(value)) if (isModId(key) && isLibraryState(state)) result[key] = state;
  return Object.freeze(result);
}
function freezeState(candidate: Partial<MockModState>): MockModState {
  const libraryEntries = normalizeEntries(candidate.libraryEntries);
  const localInstallationState = normalizeLocalStates(candidate.localInstallationState);
  return Object.freeze({
    favoriteAddedAt: normalizeFavoriteDates(candidate.favoriteAddedAt),
    favoriteModIds: normalizeIds(candidate.favoriteModIds),
    installedModIds: Object.freeze(MOD_IDS.filter((modId) => localInstallationState[modId] === 'installed' || localInstallationState[modId] === 'update-available')),
    libraryEntries,
    localInstallationState,
  });
}
function getLocalStorage(): Storage | undefined { if (typeof window === 'undefined') return undefined; try { return window.localStorage; } catch { return undefined; } }
function readStoredState(): MockModState {
  const storage = getLocalStorage();
  if (!storage) return freezeState({ libraryEntries: DEFAULT_LIBRARY });
  try {
    const stored = JSON.parse(storage.getItem(MOCK_MOD_STORAGE_KEY) ?? 'null') as Partial<MockModState> | null;
    if (stored) return freezeState(stored);
    const legacy = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) ?? 'null') as Partial<MockModState> | null;
    if (legacy) {
      const now = new Date().toISOString();
      const installedIds = normalizeIds(legacy.installedModIds);
      if (installedIds.length === 0 && normalizeIds(legacy.favoriteModIds).length === 0) {
        return freezeState({ libraryEntries: DEFAULT_LIBRARY, localInstallationState: DEFAULT_LOCAL_STATES });
      }
      return freezeState({ favoriteModIds: legacy.favoriteModIds, libraryEntries: installedIds.map((modId) => ({ modId, addedAt: now, installedAt: now })), localInstallationState: Object.fromEntries(installedIds.map((modId) => [modId, 'installed'])) });
    }
  } catch { /* malformed local mock state is ignored */ }
  return freezeState({ libraryEntries: DEFAULT_LIBRARY });
}
function persistState(next: MockModState): void { try { getLocalStorage()?.setItem(MOCK_MOD_STORAGE_KEY, JSON.stringify(next)); } catch { /* in-memory fallback */ } }
function publishState(next: MockModState): void { stateSnapshot = next; persistState(next); listeners.forEach((listener) => listener()); }
function requireMockMod(modId: ModId): Mod { const mod = mockMods.find((candidate) => candidate.id === modId); if (!mod) throw new Error(`Unknown mock mod: ${modId}`); return mod; }
function setWorkflowPhase(modId: ModId, phase: MockInstallPhase): void { workflowPhases.set(modId, phase); workflowSnapshot = new Map(workflowPhases); workflowListeners.forEach((listener) => listener()); }
function updateEntry(modId: ModId, localState: LibraryCardState): MockModState {
  const current = getMockModState();
  const previous = current.libraryEntries.find((entry) => entry.modId === modId);
  const now = new Date().toISOString();
  const nextEntry: MockCloudLibraryEntry = { modId, addedAt: previous?.addedAt ?? now, installedAt: localState === 'installed' ? now : previous?.installedAt };
  return freezeState({ ...current, libraryEntries: [...current.libraryEntries.filter((entry) => entry.modId !== modId), nextEntry], localInstallationState: { ...current.localInstallationState, [modId]: localState } });
}
function wait(duration: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, duration)); }
function normalizeSearchText(value: string): string { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim(); }
const searchableTextByModId = new Map<ModId, string>(mockMods.map((mod) => {
  const game = mockGames.find((candidate) => candidate.id === mod.gameId);
  return [mod.id, normalizeSearchText([mod.name, ...mod.aliases, mod.gameName, game?.name ?? '', ...(game?.aliases ?? [])].join(' '))];
}));

export function searchMockMods(query: string): readonly Mod[] { const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean); return terms.length === 0 ? mockMods : mockMods.filter((mod) => terms.every((term) => (searchableTextByModId.get(mod.id) ?? '').includes(term))); }
export function getMockModsForGame(gameId: GameId): readonly Mod[] { return mockMods.filter((mod) => mod.gameId === gameId); }
export function getMockModById(modId: ModId): Mod { return requireMockMod(modId); }
export function getMockModState(): MockModState { return stateSnapshot ??= readStoredState(); }
export function subscribeToMockModState(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function getMockInstallPhase(modId: ModId): MockInstallPhase { return workflowPhases.get(modId) ?? 'idle'; }
export function getMockInstallPhases(): ReadonlyMap<ModId, MockInstallPhase> { return workflowSnapshot; }
export function subscribeToMockInstallPhases(listener: Listener): () => void { workflowListeners.add(listener); return () => workflowListeners.delete(listener); }

/** Renderer-only simulation. It never calls preload, IPC, Node, or a filesystem API. */
export async function runMockInstallWorkflow(modId: ModId, options: { readonly fail?: boolean; readonly stepMs?: number } = {}): Promise<MockInstallPhase> {
  requireMockMod(modId);
  const stepMs = options.stepMs ?? 550;
  setWorkflowPhase(modId, 'downloading');
  await wait(stepMs);
  setWorkflowPhase(modId, 'installing');
  await wait(stepMs);
  if (options.fail) { setWorkflowPhase(modId, 'failure'); return 'failure'; }
  publishState(updateEntry(modId, 'installed'));
  setWorkflowPhase(modId, 'success');
  await wait(stepMs);
  setWorkflowPhase(modId, 'idle');
  return 'success';
}
export async function mockInstallMod(modId: ModId): Promise<MockModOperationResult> {
  const changed = !getMockModState().installedModIds.includes(modId);
  await runMockInstallWorkflow(modId);
  return { modId, operation: 'install', status: 'installed', changed };
}
/** Cloud library membership remains; only the mock local physical state changes. */
export async function mockUninstallMod(modId: ModId): Promise<MockModOperationResult> {
  requireMockMod(modId);
  const changed = getMockModState().installedModIds.includes(modId);
  if (changed) publishState(updateEntry(modId, 'not-installed'));
  await wait(200);
  return { modId, operation: 'uninstall', status: 'available', changed };
}
export function removeMockLibraryEntry(modId: ModId): void {
  requireMockMod(modId);
  const current = getMockModState();
  publishState(freezeState({ ...current, libraryEntries: current.libraryEntries.filter((entry) => entry.modId !== modId) }));
}
export function setMockFavorite(modId: ModId, favorite: boolean): MockModState {
  requireMockMod(modId);
  const current = getMockModState();
  const ids = favorite ? normalizeIds([...current.favoriteModIds, modId]) : Object.freeze(current.favoriteModIds.filter((id) => id !== modId));
  const dates = { ...current.favoriteAddedAt };
  if (favorite) dates[modId] = dates[modId] ?? new Date().toISOString(); else delete dates[modId];
  publishState(freezeState({ ...current, favoriteAddedAt: dates, favoriteModIds: ids }));
  return getMockModState();
}
export function toggleMockFavorite(modId: ModId): MockModState { return setMockFavorite(modId, !getMockModState().favoriteModIds.includes(modId)); }
export function getMockInstalledMods(): readonly Mod[] { const ids = new Set(getMockModState().installedModIds); return mockMods.filter((mod) => ids.has(mod.id)); }
export function getMockFavoriteMods(): readonly Mod[] { const ids = new Set(getMockModState().favoriteModIds); return mockMods.filter((mod) => ids.has(mod.id)); }
export function resetMockModServiceForTests(): void { stateSnapshot = undefined; workflowPhases.clear(); workflowSnapshot = new Map(); }
