import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { arch, hostname, platform, release } from 'node:os';
import { dirname, join } from 'node:path';

import { app } from 'electron';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type {
  CloudAccountCache,
  CloudDevice,
  CloudFavorite,
  CloudLibraryEntry,
  CloudSettings,
  CloudSettingsInput,
  CloudSyncState,
  DeviceInstallationSummary,
  DeviceSummaryInput,
  FavoriteMutationInput,
  LibraryRemoveInput,
  LibraryUpsertInput,
  SyncEventInput,
} from '../shared/cloud-sync';
import type { AuthService } from './auth-service';
import {
  CloudSyncCoordinator,
  type CloudGateway,
  type CloudSyncPersistence,
  type CloudSyncPersistenceData,
  type DeviceRegistration,
  type PendingOperation,
} from './cloud-sync-core';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPendingOperation = (value: unknown): value is PendingOperation => {
  if (!isRecord(value) || !UUID_PATTERN.test(String(value.id)) || !UUID_PATTERN.test(String(value.userId)) ||
      !['settings', 'favorite', 'libraryUpsert', 'libraryRemove', 'deviceSummary', 'event'].includes(String(value.kind)) ||
      !Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > 100 ||
      typeof value.nextAttemptAt !== 'number' || !Number.isFinite(value.nextAttemptAt) ||
      typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt)) || !isRecord(value.payload)) return false;
  const encodedPayload = JSON.stringify(value.payload);
  return encodedPayload.length <= 4096 && !/(?:[a-z]:\\|\/home\/|\/users\/)/iu.test(encodedPayload);
};

const requireData = <T>(data: T | null, error: PostgrestError | null): T => {
  if (error || data === null) throw new Error('Cloud request failed.');
  return data;
};

const bounded = (value: string, maximum: number): string =>
  [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').trim().slice(0, maximum) || 'unknown';

class JsonCloudPersistence implements CloudSyncPersistence {
  constructor(readonly filePath: string) {}

  async read(): Promise<CloudSyncPersistenceData | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Partial<CloudSyncPersistenceData>;
      if (parsed.version !== 1 || typeof parsed.deviceId !== 'string' || !UUID_PATTERN.test(parsed.deviceId) ||
          !parsed.accounts || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts) ||
          !Array.isArray(parsed.queue) || !parsed.queue.every(isPendingOperation)) return null;
      return parsed as CloudSyncPersistenceData;
    } catch {
      return null;
    }
  }

  async write(data: CloudSyncPersistenceData): Promise<void> {
    const temporary = `${this.filePath}.tmp`;
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }
}

const loadOrCreateDeviceId = async (filePath: string): Promise<string> => {
  try {
    const value = (await fs.readFile(filePath, 'utf8')).trim();
    if (UUID_PATTERN.test(value)) return value;
  } catch {
    // First launch or corrupt non-sensitive identifier.
  }
  const value = randomUUID();
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, { encoding: 'utf8', mode: 0o600 });
  return value;
};

const mapSettings = (row: Record<string, unknown>): CloudSettings => ({
  theme: row.theme as CloudSettings['theme'],
  locale: row.locale as CloudSettings['locale'],
  accountPreferences: {
    autoDetectGames: Boolean((row.account_preferences as Record<string, unknown> | null)?.autoDetectGames),
  },
  updatedAt: String(row.updated_at),
});

const mapFavorite = (row: Record<string, unknown>): CloudFavorite => ({ modId: String(row.mod_id), createdAt: String(row.created_at) });
const mapLibrary = (row: Record<string, unknown>): CloudLibraryEntry => ({
  modId: String(row.mod_id),
  firstInstalledAt: String(row.first_installed_at),
  lastInstalledAt: String(row.last_installed_at),
  lastInstalledVersion: typeof row.last_installed_version === 'string' ? row.last_installed_version : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});
const mapDevice = (row: Record<string, unknown>): CloudDevice => ({
  id: String(row.id), name: String(row.device_name), os: String(row.os), architecture: String(row.architecture),
  appVersion: String(row.app_version), createdAt: String(row.created_at), lastSeenAt: String(row.last_seen_at),
});
const mapSummary = (row: Record<string, unknown>): DeviceInstallationSummary => ({
  deviceId: String(row.device_id), modId: String(row.mod_id), state: row.summary_state as DeviceInstallationSummary['state'],
  installedVersion: typeof row.installed_version === 'string' ? row.installed_version : null,
  observedAt: String(row.observed_at), updatedAt: String(row.updated_at),
});

class SupabaseCloudGateway implements CloudGateway {
  constructor(readonly client: SupabaseClient) {}

  async fetchProfile(userId: string): Promise<void> {
    const { error } = await this.client.from('profiles').select('user_id').eq('user_id', userId).single();
    if (error) throw new Error('Profile unavailable.');
  }

  async fetchSettings(userId: string): Promise<CloudSettings> {
    const { data, error } = await this.client.from('user_settings')
      .select('theme,locale,account_preferences,updated_at').eq('user_id', userId).single();
    return mapSettings(requireData(data as Record<string, unknown> | null, error));
  }

  async fetchFavorites(userId: string): Promise<readonly CloudFavorite[]> {
    const { data, error } = await this.client.from('user_favorites')
      .select('mod_id,created_at').eq('user_id', userId).order('created_at');
    return requireData(data as Record<string, unknown>[] | null, error).map(mapFavorite);
  }

  async fetchLibrary(userId: string): Promise<readonly CloudLibraryEntry[]> {
    const { data, error } = await this.client.from('user_library')
      .select('mod_id,first_installed_at,last_installed_at,last_installed_version,created_at,updated_at')
      .eq('user_id', userId).order('created_at');
    return requireData(data as Record<string, unknown>[] | null, error).map(mapLibrary);
  }

  async upsertDevice(userId: string, device: DeviceRegistration): Promise<CloudDevice> {
    const now = new Date().toISOString();
    const { data, error } = await this.client.from('devices').upsert({
      id: device.id, user_id: userId, device_name: device.name, os: device.os,
      architecture: device.architecture, app_version: device.appVersion, last_seen_at: now,
    }, { onConflict: 'id,user_id' }).select('id,device_name,os,architecture,app_version,created_at,last_seen_at').single();
    return mapDevice(requireData(data as Record<string, unknown> | null, error));
  }

  async fetchDeviceSummaries(userId: string): Promise<readonly DeviceInstallationSummary[]> {
    const { data, error } = await this.client.from('device_installation_summaries')
      .select('device_id,mod_id,summary_state,installed_version,observed_at,updated_at').eq('user_id', userId);
    return requireData(data as Record<string, unknown>[] | null, error).map(mapSummary);
  }

  async execute(operation: PendingOperation, deviceId: string): Promise<Partial<CloudAccountCache> | void> {
    const userId = operation.userId;
    switch (operation.kind) {
      case 'favorite': {
        const { error } = operation.payload.favorite
          ? await this.client.from('user_favorites').upsert({ user_id: userId, mod_id: operation.payload.modId }, { onConflict: 'user_id,mod_id', ignoreDuplicates: true })
          : await this.client.from('user_favorites').delete().eq('user_id', userId).eq('mod_id', operation.payload.modId);
        if (error) throw new Error('Favorite sync failed.');
        return { favorites: await this.fetchFavorites(userId) };
      }
      case 'libraryUpsert': {
        const { error } = await this.client.from('user_library').upsert({
          user_id: userId, mod_id: operation.payload.modId,
          first_installed_at: operation.payload.installedAt, last_installed_at: operation.payload.installedAt,
          last_installed_version: operation.payload.installedVersion,
        }, { onConflict: 'user_id,mod_id' });
        if (error) throw new Error('Library sync failed.');
        return { library: await this.fetchLibrary(userId) };
      }
      case 'libraryRemove': {
        const { error } = await this.client.from('user_library').delete().eq('user_id', userId).eq('mod_id', operation.payload.modId);
        if (error) throw new Error('Library sync failed.');
        return { library: await this.fetchLibrary(userId) };
      }
      case 'deviceSummary': {
        const { error } = await this.client.from('device_installation_summaries').upsert({
          user_id: userId, device_id: deviceId, mod_id: operation.payload.modId,
          summary_state: operation.payload.state, installed_version: operation.payload.installedVersion,
          observed_at: operation.payload.observedAt,
        }, { onConflict: 'user_id,device_id,mod_id' });
        if (error) throw new Error('Device summary sync failed.');
        return { deviceSummaries: await this.fetchDeviceSummaries(userId) };
      }
      case 'event': {
        const { error } = await this.client.from('user_sync_events').upsert({
          id: operation.id, user_id: userId, event_name: operation.payload.name, metadata: operation.payload.metadata,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error('Event sync failed.');
        return;
      }
      case 'settings': {
        const values = {
          theme: operation.payload.theme, locale: operation.payload.locale,
          account_preferences: operation.payload.accountPreferences,
        };
        const base = operation.payload.baseUpdatedAt;
        const query = this.client.from('user_settings').update(values).eq('user_id', userId);
        const { data, error } = await (base ? query.eq('updated_at', base) : query)
          .select('theme,locale,account_preferences,updated_at').maybeSingle();
        if (error) throw new Error('Settings sync failed.');
        if (data) return { settings: mapSettings(data as Record<string, unknown>) };
        return { settings: await this.fetchSettings(userId) };
      }
    }
  }
}

export class CloudSyncService {
  readonly #auth: AuthService;
  readonly #coordinator: CloudSyncCoordinator | null;
  #bootstrapTask: Promise<CloudSyncState> | null = null;

  private constructor(auth: AuthService, coordinator: CloudSyncCoordinator | null) {
    this.#auth = auth;
    this.#coordinator = coordinator;
  }

  static async create(auth: AuthService, emit: (state: CloudSyncState) => void): Promise<CloudSyncService> {
    const client = auth.getCloudClient();
    if (!client) return new CloudSyncService(auth, null);
    const root = join(app.getPath('userData'), 'cloud-sync');
    const deviceId = await loadOrCreateDeviceId(join(root, 'device-id'));
    const device: DeviceRegistration = {
      id: deviceId,
      name: bounded(hostname(), 120),
      os: bounded(`${platform()} ${release()}`, 80),
      architecture: bounded(arch(), 40),
      appVersion: bounded(app.getVersion(), 40),
    };
    const coordinator = new CloudSyncCoordinator({
      gateway: new SupabaseCloudGateway(client),
      persistence: new JsonCloudPersistence(join(root, 'state.json')),
      device,
      emit,
      createId: randomUUID,
    });
    await coordinator.initialize();
    return new CloudSyncService(auth, coordinator);
  }

  getState(): CloudSyncState {
    return this.#coordinator?.getState() ?? {
      status: 'offline',
      steps: { authenticate: 'failed', profile: 'pending', settings: 'pending', favorites: 'pending', library: 'pending', device: 'pending', deviceSummaries: 'pending', home: 'ready' },
      account: null, pendingOperations: 0, lastSyncedAt: null,
      error: { code: 'configurationUnavailable', message: 'Cloud sync is not configured in this build.' },
    };
  }

  async bootstrap(): Promise<CloudSyncState> {
    const userId = this.#auth.getState().user?.id;
    if (!userId || !this.#coordinator) return this.getState();
    if (this.#bootstrapTask) return this.#bootstrapTask;
    this.#bootstrapTask = this.#coordinator.bootstrap(userId).finally(() => {
      this.#bootstrapTask = null;
    });
    return this.#bootstrapTask;
  }

  signOut(): void { this.#coordinator?.signOut(); }
  updateSettings(input: CloudSettingsInput) { return this.#coordinator?.updateSettings(input) ?? Promise.resolve(this.getState()); }
  setFavorite(input: FavoriteMutationInput) { return this.#coordinator?.setFavorite(input) ?? Promise.resolve(this.getState()); }
  upsertLibrary(input: LibraryUpsertInput) { return this.#coordinator?.upsertLibrary(input) ?? Promise.resolve(this.getState()); }
  removeLibrary(input: LibraryRemoveInput) { return this.#coordinator?.removeLibrary(input) ?? Promise.resolve(this.getState()); }
  updateDeviceSummary(input: DeviceSummaryInput) { return this.#coordinator?.updateDeviceSummary(input) ?? Promise.resolve(this.getState()); }
  recordEvent(input: SyncEventInput) { return this.#coordinator?.recordEvent(input) ?? Promise.resolve(this.getState()); }
  retryPending() { return this.#coordinator?.retryPending() ?? Promise.resolve(this.getState()); }
}
