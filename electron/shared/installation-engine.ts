export const INSTALLATION_ENGINE_CHANNELS = {
  getState: 'installation-engine:get-state',
  install: 'installation-engine:install',
  uninstall: 'installation-engine:uninstall',
} as const;

export type InstallationEngineInvokeChannel =
  (typeof INSTALLATION_ENGINE_CHANNELS)[keyof typeof INSTALLATION_ENGINE_CHANNELS];

export type GameStore = 'steam' | 'epic' | 'rockstar' | 'xbox' | 'manual';
export type GameEdition = 'legacy' | 'enhanced' | 'standard';
export type StableGameId = 'gta5-legacy' | 'gta5-enhanced' | `game-${string}`;

export interface VerifiedGameInstallation {
  readonly detectionId: string;
  readonly gameId: StableGameId;
  readonly rootPath: string;
  readonly store: GameStore;
  readonly executablePath: string;
  readonly edition: GameEdition;
  readonly version: string;
  readonly verified: true;
}

export interface InstallationTarget {
  readonly gameDetectionId: string;
  readonly packageInputId: string;
}

export interface UninstallTarget {
  readonly gameDetectionId: string;
  readonly modId: string;
}

export type InstallationDisposition =
  | 'not-installed'
  | 'already-installed'
  | 'update-available'
  | 'reinstall-required';

export type InstallationEngineErrorCode =
  | 'invalid-request'
  | 'game-not-found'
  | 'package-not-found'
  | 'invalid-manifest'
  | 'incompatible-game'
  | 'incompatible-edition'
  | 'incompatible-version'
  | 'already-installed'
  | 'ownership-conflict'
  | 'unsafe-path'
  | 'integrity-failed'
  | 'operation-failed'
  | 'not-installed';

export interface InstallationEngineError {
  readonly code: InstallationEngineErrorCode;
  readonly message: string;
}

export interface InstallationEngineResult {
  readonly ok: boolean;
  readonly disposition: InstallationDisposition;
  readonly modId: string | null;
  readonly version: string | null;
  readonly error: InstallationEngineError | null;
}

export interface InstallationEngineState {
  readonly detections: readonly Omit<VerifiedGameInstallation, 'rootPath' | 'executablePath'>[];
  readonly installed: readonly {
    readonly modId: string;
    readonly version: string;
    readonly gameId: StableGameId;
    readonly edition: GameEdition;
  }[];
}

export interface LyorInstallationEngineApi {
  getState(): Promise<InstallationEngineState>;
  install(input: InstallationTarget): Promise<InstallationEngineResult>;
  uninstall(input: UninstallTarget): Promise<InstallationEngineResult>;
}

export const MANIFEST_OPERATION_TYPES = [
  'COPY_FILE',
  'COPY_FOLDER',
  'REPLACE_FILE',
  'DELETE_FILE',
  'CREATE_DIRECTORY',
] as const;

export type ManifestOperationType = (typeof MANIFEST_OPERATION_TYPES)[number];

export interface ManifestSource {
  readonly id: string;
  readonly path: string;
  readonly sha256?: string;
  readonly size?: number;
}

export interface ManifestOperation {
  readonly type: ManifestOperationType;
  readonly source?: string;
  readonly target: string;
}

export interface InstallationManifestV1 {
  readonly schemaVersion: 1;
  readonly mod: {
    readonly id: string;
    readonly version: string;
  };
  readonly game: {
    readonly id: StableGameId;
    readonly edition: GameEdition;
    readonly versionRange?: string;
  };
  readonly adapter: 'generic-files';
  readonly sources: readonly ManifestSource[];
  readonly operations: readonly ManifestOperation[];
  readonly dependencies: readonly {
    readonly modId: string;
    readonly versionRange: string;
    readonly optional: boolean;
  }[];
  readonly conflicts: readonly string[];
  readonly checksums: {
    readonly algorithm: 'sha256';
  };
  readonly installedSize: number;
}
