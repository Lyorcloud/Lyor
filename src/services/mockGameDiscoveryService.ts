import { mockSidebarGames } from '../data/mockGames';
import type { Game } from '../types/domain';

export interface MockGameDiscoveryEntry {
  readonly game: Game;
  readonly path: null;
  readonly status: 'not-detected';
}

const mockEntries: readonly MockGameDiscoveryEntry[] = mockSidebarGames.slice(0, 3).map((game) => ({
  game,
  path: null,
  status: 'not-detected',
}));

/**
 * Explicit renderer-only mock. It never inspects Steam, Epic, Xbox, or local game folders.
 */
export function getMockGameDiscoveryEntries(): readonly MockGameDiscoveryEntry[] {
  return mockEntries;
}

/** Resolves without touching the filesystem and never fabricates detected paths. */
export async function scanForGamesMock(): Promise<readonly MockGameDiscoveryEntry[]> {
  return mockEntries;
}

/** The foundation build has no privileged folder picker, so this mock never changes a path. */
export async function requestGamePathChangeMock(): Promise<false> {
  return false;
}
