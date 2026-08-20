import { describe, expect, it } from 'vitest';

import {
  CloudSyncCoordinator,
  type CloudGateway,
  type CloudSyncPersistence,
  type CloudSyncPersistenceData,
  type DeviceRegistration,
  type PendingOperation,
} from '../electron/main/cloud-sync-core';
import type {
  CloudAccountCache,
  CloudDevice,
  CloudFavorite,
  CloudLibraryEntry,
  CloudSettings,
  DeviceInstallationSummary,
} from '../electron/shared/cloud-sync';

const userId = '30000000-0000-0000-0000-000000000003';
const deviceA: DeviceRegistration = { id: '30000000-0000-4000-8000-000000000031', name: 'PC A', os: 'Windows', architecture: 'x64', appVersion: '1.2.0' };
const deviceB: DeviceRegistration = { ...deviceA, id: '30000000-0000-4000-8000-000000000032', name: 'PC B' };
const settings: CloudSettings = { theme: 'dark', locale: 'tr', accountPreferences: { autoDetectGames: false }, updatedAt: '2026-08-20T08:00:00.000Z' };
const library: CloudLibraryEntry[] = [{ modId: 'mod-a', firstInstalledAt: '2026-01-01T00:00:00.000Z', lastInstalledAt: '2026-02-01T00:00:00.000Z', lastInstalledVersion: '1.0', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' }];

class MemoryPersistence implements CloudSyncPersistence {
  value: CloudSyncPersistenceData | null = null;
  async read() { return this.value ? structuredClone(this.value) : null; }
  async write(data: CloudSyncPersistenceData) { this.value = structuredClone(data); }
}

class FakeGateway implements CloudGateway {
  calls: string[] = [];
  failStep: string | null = null;
  failAll = false;
  failExecute = false;
  favorites: CloudFavorite[] = [];
  summaries: DeviceInstallationSummary[] = [];
  library = [...library];
  executedIds = new Set<string>();

  async fetchProfile() { this.calls.push('profile'); if (this.failAll || this.failStep === 'profile') throw new Error(); }
  async fetchSettings() { this.calls.push('settings'); if (this.failAll || this.failStep === 'settings') throw new Error(); return settings; }
  async fetchFavorites() { this.calls.push('favorites'); if (this.failAll || this.failStep === 'favorites') throw new Error(); return this.favorites; }
  async fetchLibrary() { this.calls.push('library'); if (this.failAll || this.failStep === 'library') throw new Error(); return this.library; }
  async upsertDevice(_userId: string, device: DeviceRegistration): Promise<CloudDevice> {
    this.calls.push('device'); if (this.failAll || this.failStep === 'device') throw new Error();
    return { ...device, createdAt: '2026-08-20T08:00:00.000Z', lastSeenAt: '2026-08-20T08:00:00.000Z' };
  }
  async fetchDeviceSummaries() { this.calls.push('summaries'); if (this.failAll || this.failStep === 'summaries') throw new Error(); return this.summaries; }
  async execute(operation: PendingOperation, deviceId: string): Promise<Partial<CloudAccountCache> | void> {
    if (this.failExecute) throw new Error('offline');
    if (this.executedIds.has(operation.id)) return;
    this.executedIds.add(operation.id);
    if (operation.kind === 'favorite') {
      this.favorites = operation.payload.favorite
        ? [{ modId: operation.payload.modId, createdAt: operation.createdAt }]
        : [];
      return { favorites: this.favorites };
    }
    if (operation.kind === 'deviceSummary') {
      this.summaries = [{ deviceId, modId: operation.payload.modId, state: operation.payload.state, installedVersion: operation.payload.installedVersion, observedAt: operation.payload.observedAt, updatedAt: operation.createdAt }];
      return { deviceSummaries: this.summaries };
    }
    if (operation.kind === 'settings') return { settings };
  }
}

const createCoordinator = (gateway: FakeGateway, persistence: MemoryPersistence, device = deviceA, now = () => Date.parse('2026-08-20T08:00:00.000Z')) =>
  new CloudSyncCoordinator({ gateway, persistence, device, emit: () => undefined, createId: () => `50000000-0000-4000-8000-${String(gateway.executedIds.size + 1).padStart(12, '0')}`, now });

describe('CloudSyncCoordinator', () => {
  it('continues the ordered bootstrap after a partial failure', async () => {
    const gateway = new FakeGateway();
    gateway.failStep = 'favorites';
    const coordinator = createCoordinator(gateway, new MemoryPersistence());
    await coordinator.initialize();
    const state = await coordinator.bootstrap(userId);
    expect(gateway.calls.slice(0, 6)).toEqual(['profile', 'settings', 'favorites', 'library', 'device', 'summaries']);
    expect(state.status).toBe('partial');
    expect(state.steps.favorites).toBe('failed');
    expect(state.steps.home).toBe('ready');
    expect(state.account?.library).toHaveLength(1);
  });

  it('persists offline mutations and retries each idempotency key once after restart', async () => {
    let now = Date.parse('2026-08-20T08:00:00.000Z');
    const persistence = new MemoryPersistence();
    const offline = new FakeGateway();
    offline.failExecute = true;
    const first = createCoordinator(offline, persistence, deviceA, () => now);
    await first.initialize();
    await first.bootstrap(userId);
    const queued = await first.setFavorite({ modId: 'mod-a', favorite: true });
    expect(queued.pendingOperations).toBe(1);
    expect(persistence.value?.queue).toHaveLength(1);
    first.signOut();
    expect(persistence.value?.accounts[userId]?.favorites[0]?.modId).toBe('mod-a');

    now += 2_000;
    const online = new FakeGateway();
    const second = createCoordinator(online, persistence, deviceA, () => now);
    await second.initialize();
    const restored = await second.bootstrap(userId);
    expect(restored.pendingOperations).toBe(0);
    expect(online.executedIds.size).toBe(1);
    expect(restored.account?.favorites[0]?.modId).toBe('mod-a');
  });

  it('reconciles per-device summaries from local truth without deleting Cloud Library', async () => {
    const gateway = new FakeGateway();
    gateway.summaries = [{ deviceId: deviceB.id, modId: 'mod-a', state: 'installed', installedVersion: '1.0', observedAt: '2026-08-20T07:00:00.000Z', updatedAt: '2026-08-20T07:00:00.000Z' }];
    const coordinator = createCoordinator(gateway, new MemoryPersistence(), deviceA);
    await coordinator.initialize();
    await coordinator.bootstrap(userId);
    const state = await coordinator.reconcile({ 'mod-a': { installed: false, version: null } });
    expect(state.account?.library).toHaveLength(1);
    expect(gateway.summaries[0]).toMatchObject({ deviceId: deviceA.id, modId: 'mod-a', state: 'not_installed' });
  });

  it('keeps cached account data available when the complete bootstrap is offline', async () => {
    const persistence = new MemoryPersistence();
    persistence.value = {
      version: 1,
      deviceId: deviceA.id,
      accounts: { [userId]: { userId, profileLoaded: true, settings, favorites: [], library, device: null, deviceSummaries: [], cachedAt: '2026-08-20T07:00:00.000Z' } },
      queue: [],
    };
    const gateway = new FakeGateway();
    gateway.failAll = true;
    const coordinator = createCoordinator(gateway, persistence);
    await coordinator.initialize();
    const state = await coordinator.bootstrap(userId);
    expect(state.status).toBe('offline');
    expect(state.account?.library).toHaveLength(1);
  });

  it('lets the cloud revision win a settings conflict after an optimistic update', async () => {
    const gateway = new FakeGateway();
    const coordinator = createCoordinator(gateway, new MemoryPersistence());
    await coordinator.initialize();
    await coordinator.bootstrap(userId);
    const state = await coordinator.updateSettings({ theme: 'light', locale: 'en', accountPreferences: { autoDetectGames: true }, baseUpdatedAt: settings.updatedAt });
    expect(state.account?.settings).toEqual(settings);
    expect(state.pendingOperations).toBe(0);
  });
});
