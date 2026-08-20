import { beforeEach, describe, expect, it } from 'vitest';

import { hydrateCloudAccountState, resetMockModServiceForTests } from '../src/services/mockModService';
import type { CloudAccountCache } from '../electron/shared/cloud-sync';

beforeEach(() => {
  window.localStorage.clear();
  resetMockModServiceForTests();
});

describe('multi-PC local truth', () => {
  it('shows Cloud Library ownership as not installed on a new device', () => {
    const account: CloudAccountCache = {
      userId: '30000000-0000-0000-0000-000000000003',
      profileLoaded: true,
      settings: null,
      favorites: [],
      library: [{
        modId: 'rampage-trainer-rdr2', firstInstalledAt: '2026-01-01T00:00:00.000Z',
        lastInstalledAt: '2026-02-01T00:00:00.000Z', lastInstalledVersion: '1.0',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
      }],
      device: { id: '30000000-0000-4000-8000-000000000032', name: 'New PC', os: 'Windows', architecture: 'x64', appVersion: '1.2.0', createdAt: '2026-08-20T08:00:00.000Z', lastSeenAt: '2026-08-20T08:00:00.000Z' },
      deviceSummaries: [{ deviceId: '30000000-0000-4000-8000-000000000031', modId: 'rampage-trainer-rdr2', state: 'installed', installedVersion: '1.0', observedAt: '2026-08-20T07:00:00.000Z', updatedAt: '2026-08-20T07:00:00.000Z' }],
      cachedAt: '2026-08-20T08:00:00.000Z',
    };
    const state = hydrateCloudAccountState(account);
    expect(state.libraryEntries).toHaveLength(1);
    expect(state.localInstallationState['rampage-trainer-rdr2']).toBe('not-installed');
    expect(state.installedModIds).not.toContain('rampage-trainer-rdr2');
  });
});
