import type {
  BootstrapStep,
  BootstrapStepStatus,
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

export type PendingOperation =
  | { readonly id: string; readonly userId: string; readonly kind: 'settings'; readonly payload: CloudSettingsInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string }
  | { readonly id: string; readonly userId: string; readonly kind: 'favorite'; readonly payload: FavoriteMutationInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string }
  | { readonly id: string; readonly userId: string; readonly kind: 'libraryUpsert'; readonly payload: LibraryUpsertInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string }
  | { readonly id: string; readonly userId: string; readonly kind: 'libraryRemove'; readonly payload: LibraryRemoveInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string }
  | { readonly id: string; readonly userId: string; readonly kind: 'deviceSummary'; readonly payload: DeviceSummaryInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string }
  | { readonly id: string; readonly userId: string; readonly kind: 'event'; readonly payload: SyncEventInput; readonly attempts: number; readonly nextAttemptAt: number; readonly createdAt: string };

export interface CloudSyncPersistenceData {
  readonly version: 1;
  readonly deviceId: string;
  readonly accounts: Readonly<Record<string, CloudAccountCache>>;
  readonly queue: readonly PendingOperation[];
}

export interface CloudSyncPersistence {
  readonly read: () => Promise<CloudSyncPersistenceData | null>;
  readonly write: (data: CloudSyncPersistenceData) => Promise<void>;
}

export interface DeviceRegistration {
  readonly id: string;
  readonly name: string;
  readonly os: string;
  readonly architecture: string;
  readonly appVersion: string;
}

export interface CloudGateway {
  readonly fetchProfile: (userId: string) => Promise<void>;
  readonly fetchSettings: (userId: string) => Promise<CloudSettings>;
  readonly fetchFavorites: (userId: string) => Promise<readonly CloudFavorite[]>;
  readonly fetchLibrary: (userId: string) => Promise<readonly CloudLibraryEntry[]>;
  readonly upsertDevice: (userId: string, device: DeviceRegistration) => Promise<CloudDevice>;
  readonly fetchDeviceSummaries: (userId: string) => Promise<readonly DeviceInstallationSummary[]>;
  readonly execute: (operation: PendingOperation, deviceId: string) => Promise<Partial<CloudAccountCache> | void>;
}

const STEPS: readonly BootstrapStep[] = [
  'authenticate', 'profile', 'settings', 'favorites', 'library', 'device', 'deviceSummaries', 'home',
];

const stepRecord = (value: BootstrapStepStatus): Record<BootstrapStep, BootstrapStepStatus> =>
  Object.fromEntries(STEPS.map((step) => [step, value])) as Record<BootstrapStep, BootstrapStepStatus>;

const signedOutState = (): CloudSyncState => ({
  status: 'signedOut',
  steps: stepRecord('pending'),
  account: null,
  pendingOperations: 0,
  lastSyncedAt: null,
  error: null,
});

const emptyAccount = (userId: string, now: string): CloudAccountCache => ({
  userId,
  profileLoaded: false,
  settings: null,
  favorites: [],
  library: [],
  device: null,
  deviceSummaries: [],
  cachedAt: now,
});

const retryDelay = (attempts: number): number => Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));

export class CloudSyncCoordinator {
  readonly #gateway: CloudGateway;
  readonly #persistence: CloudSyncPersistence;
  readonly #device: DeviceRegistration;
  readonly #emit: (state: CloudSyncState) => void;
  readonly #now: () => number;
  readonly #createId: () => string;
  #data: CloudSyncPersistenceData;
  #activeUserId: string | null = null;
  #generation = 0;
  #state: CloudSyncState = signedOutState();

  constructor(options: {
    readonly gateway: CloudGateway;
    readonly persistence: CloudSyncPersistence;
    readonly device: DeviceRegistration;
    readonly emit: (state: CloudSyncState) => void;
    readonly now?: () => number;
    readonly createId: () => string;
  }) {
    this.#gateway = options.gateway;
    this.#persistence = options.persistence;
    this.#device = options.device;
    this.#emit = options.emit;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId;
    this.#data = { version: 1, deviceId: options.device.id, accounts: {}, queue: [] };
  }

  async initialize(): Promise<void> {
    const stored = await this.#persistence.read();
    if (stored?.version === 1 && stored.deviceId === this.#device.id) this.#data = stored;
  }

  getState(): CloudSyncState { return this.#state; }

  async bootstrap(userId: string): Promise<CloudSyncState> {
    this.#activeUserId = userId;
    const generation = ++this.#generation;
    const now = new Date(this.#now()).toISOString();
    let account = this.#data.accounts[userId] ?? emptyAccount(userId, now);
    const steps = stepRecord('pending');
    steps.authenticate = 'ready';
    this.#setState({ status: 'bootstrapping', steps, account, pendingOperations: this.#pendingCount(userId), lastSyncedAt: null, error: null });
    let failures = 0;

    const run = async <T>(step: BootstrapStep, action: () => Promise<T>, apply: (value: T) => void) => {
      steps[step] = 'loading';
      this.#setState({ ...this.#state, steps: { ...steps } });
      try {
        const value = await action();
        apply(value);
        steps[step] = 'ready';
      } catch {
        failures += 1;
        steps[step] = 'failed';
      }
      account = { ...account, cachedAt: new Date(this.#now()).toISOString() };
      await this.#saveAccount(account);
      if (generation !== this.#generation) return;
      this.#setState({ ...this.#state, account, steps: { ...steps }, pendingOperations: this.#pendingCount(userId) });
    };

    await run('profile', () => this.#gateway.fetchProfile(userId), () => { account = { ...account, profileLoaded: true }; });
    await run('settings', () => this.#gateway.fetchSettings(userId), (settings) => { account = { ...account, settings }; });
    await run('favorites', () => this.#gateway.fetchFavorites(userId), (favorites) => { account = { ...account, favorites }; });
    await run('library', () => this.#gateway.fetchLibrary(userId), (library) => { account = { ...account, library }; });
    await run('device', () => this.#gateway.upsertDevice(userId, this.#device), (device) => { account = { ...account, device }; });
    await run('deviceSummaries', () => this.#gateway.fetchDeviceSummaries(userId), (deviceSummaries) => { account = { ...account, deviceSummaries }; });
    await this.retryPending();
    if (generation !== this.#generation) return this.#state;
    account = this.#data.accounts[userId] ?? account;
    steps.home = 'ready';
    const status = failures === 0 ? 'ready' : failures === 6 ? 'offline' : 'partial';
    this.#setState({
      status,
      steps: { ...steps },
      account,
      pendingOperations: this.#pendingCount(userId),
      lastSyncedAt: failures === 0 ? new Date(this.#now()).toISOString() : null,
      error: failures === 0 ? null : {
        code: status === 'offline' ? 'offline' : 'partialFailure',
        message: status === 'offline' ? 'Cloud is unavailable; cached account data is active.' : 'Some cloud data could not be refreshed.',
      },
    });
    return this.#state;
  }

  signOut(): void {
    this.#generation += 1;
    this.#activeUserId = null;
    this.#setState({ ...signedOutState(), pendingOperations: this.#data.queue.length });
  }

  async updateSettings(input: CloudSettingsInput): Promise<CloudSyncState> {
    return this.#mutate('settings', input, (account, createdAt) => ({
      ...account,
      settings: { theme: input.theme, locale: input.locale, accountPreferences: input.accountPreferences, updatedAt: createdAt },
    }));
  }

  async setFavorite(input: FavoriteMutationInput): Promise<CloudSyncState> {
    return this.#mutate('favorite', input, (account, createdAt) => ({
      ...account,
      favorites: input.favorite
        ? [...account.favorites.filter((item) => item.modId !== input.modId), { modId: input.modId, createdAt }]
        : account.favorites.filter((item) => item.modId !== input.modId),
    }));
  }

  async upsertLibrary(input: LibraryUpsertInput): Promise<CloudSyncState> {
    return this.#mutate('libraryUpsert', input, (account, createdAt) => {
      const previous = account.library.find((entry) => entry.modId === input.modId);
      const entry: CloudLibraryEntry = {
        modId: input.modId,
        firstInstalledAt: previous?.firstInstalledAt ?? input.installedAt,
        lastInstalledAt: input.installedAt,
        lastInstalledVersion: input.installedVersion,
        createdAt: previous?.createdAt ?? createdAt,
        updatedAt: createdAt,
      };
      return { ...account, library: [...account.library.filter((item) => item.modId !== input.modId), entry] };
    });
  }

  async removeLibrary(input: LibraryRemoveInput): Promise<CloudSyncState> {
    return this.#mutate('libraryRemove', input, (account) => ({ ...account, library: account.library.filter((item) => item.modId !== input.modId) }));
  }

  async updateDeviceSummary(input: DeviceSummaryInput): Promise<CloudSyncState> {
    return this.#mutate('deviceSummary', input, (account, createdAt) => {
      const summary: DeviceInstallationSummary = {
        deviceId: this.#device.id,
        modId: input.modId,
        state: input.state,
        installedVersion: input.installedVersion,
        observedAt: input.observedAt,
        updatedAt: createdAt,
      };
      return { ...account, deviceSummaries: [...account.deviceSummaries.filter((item) => !(item.deviceId === this.#device.id && item.modId === input.modId)), summary] };
    });
  }

  async recordEvent(input: SyncEventInput): Promise<CloudSyncState> {
    return this.#mutate('event', input, (account) => account);
  }

  async retryPending(): Promise<CloudSyncState> {
    const userId = this.#activeUserId;
    if (!userId) return this.#state;
    const now = this.#now();
    for (const operation of [...this.#data.queue]) {
      if (operation.userId !== userId || operation.nextAttemptAt > now) continue;
      try {
        const patch = await this.#gateway.execute(operation, this.#device.id);
        this.#data = { ...this.#data, queue: this.#data.queue.filter((item) => item.id !== operation.id) };
        if (patch) {
          const account = this.#data.accounts[userId];
          if (account) await this.#saveAccount({ ...account, ...patch, cachedAt: new Date(this.#now()).toISOString() });
        }
      } catch {
        this.#data = {
          ...this.#data,
          queue: this.#data.queue.map((item) => item.id === operation.id
            ? { ...item, attempts: item.attempts + 1, nextAttemptAt: now + retryDelay(item.attempts + 1) }
            : item),
        };
      }
      await this.#persistence.write(this.#data);
    }
    const account = this.#data.accounts[userId] ?? this.#state.account;
    if (this.#activeUserId !== userId) return this.#state;
    this.#setState({ ...this.#state, account, pendingOperations: this.#pendingCount(userId) });
    return this.#state;
  }

  async reconcile(local: Readonly<Record<string, { readonly installed: boolean; readonly version: string | null }>>): Promise<CloudSyncState> {
    const account = this.#state.account;
    if (!account) return this.#state;
    const currentSummaries = account.deviceSummaries.filter((summary) => summary.deviceId === this.#device.id);
    const modIds = new Set([...Object.keys(local), ...currentSummaries.map((summary) => summary.modId)]);
    for (const modId of modIds) {
      const physical = local[modId];
      const summary = currentSummaries.find((item) => item.modId === modId);
      const desiredState = physical?.installed ? 'installed' : 'not_installed';
      if (summary?.state !== desiredState || (physical?.installed && summary.installedVersion !== physical.version)) {
        await this.updateDeviceSummary({
          modId,
          state: desiredState,
          installedVersion: physical?.installed ? physical.version : null,
          observedAt: new Date(this.#now()).toISOString(),
        });
      }
    }
    return this.#state;
  }

  async #mutate<K extends PendingOperation['kind']>(
    kind: K,
    payload: Extract<PendingOperation, { kind: K }>['payload'],
    optimistic: (account: CloudAccountCache, createdAt: string) => CloudAccountCache,
  ): Promise<CloudSyncState> {
    const userId = this.#activeUserId;
    const account = this.#state.account;
    if (!userId || !account) {
      this.#setState({ ...this.#state, error: { code: 'notAuthenticated', message: 'Sign in before using cloud actions.' } });
      return this.#state;
    }
    const createdAt = new Date(this.#now()).toISOString();
    const nextAccount = { ...optimistic(account, createdAt), cachedAt: createdAt };
    const operation = {
      id: this.#createId(), userId, kind, payload, attempts: 0, nextAttemptAt: 0, createdAt,
    } as Extract<PendingOperation, { kind: K }>;
    this.#data = { ...this.#data, accounts: { ...this.#data.accounts, [userId]: nextAccount }, queue: [...this.#data.queue, operation] };
    await this.#persistence.write(this.#data);
    this.#setState({ ...this.#state, account: nextAccount, pendingOperations: this.#pendingCount(userId), error: null });
    await this.retryPending();
    return this.#state;
  }

  async #saveAccount(account: CloudAccountCache): Promise<void> {
    this.#data = { ...this.#data, accounts: { ...this.#data.accounts, [account.userId]: account } };
    await this.#persistence.write(this.#data);
  }

  #pendingCount(userId: string): number { return this.#data.queue.filter((item) => item.userId === userId).length; }
  #setState(state: CloudSyncState): void { this.#state = state; this.#emit(state); }
}
