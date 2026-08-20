import type { GameEdition, StableGameId } from './installation-engine';

export const ADAPTER_CAPABILITIES = [
  'file-operations',
  'archive-operations',
  'mod-layer',
  'config-merge',
  'version-detection',
  'validation',
] as const;
export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

export const ADVANCED_OPERATION_TYPES = [
  'ARCHIVE_ADD', 'ARCHIVE_REPLACE', 'ARCHIVE_DELETE', 'CONFIG_MERGE',
] as const;
export type AdvancedOperationType = (typeof ADVANCED_OPERATION_TYPES)[number];

export interface AdvancedManifestOperation {
  readonly type: AdvancedOperationType;
  readonly target: string;
  readonly entry?: string;
  readonly source?: string;
  readonly format?: 'json';
}

export interface InstallationManifestV2 {
  readonly schemaVersion: 2;
  readonly mod: { readonly id: string; readonly version: string };
  readonly game: {
    readonly id: StableGameId;
    readonly edition: GameEdition;
    readonly versionRange?: string;
  };
  readonly adapter: string;
  readonly requiredCapabilities: readonly AdapterCapability[];
  readonly sources: readonly { readonly id: string; readonly path: string; readonly sha256: string }[];
  readonly operations: readonly AdvancedManifestOperation[];
  readonly dependencies: readonly { readonly modId: string; readonly versionRange: string; readonly optional: boolean }[];
  readonly conflicts: readonly string[];
  readonly installedSize: number;
}

export interface ArchiveEntryInfo {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface ArchiveHandler {
  open(path: string): Promise<void>;
  inspect(): readonly ArchiveEntryInfo[];
  read(entryPath: string): Uint8Array;
  add(entryPath: string, bytes: Uint8Array): void;
  replace(entryPath: string, bytes: Uint8Array): void;
  delete(entryPath: string): void;
  backup(destinationPath: string): Promise<string>;
  verify(): Promise<void>;
  commit(): Promise<void>;
}

export interface GameAdapter {
  readonly id: string;
  readonly capabilities: ReadonlySet<AdapterCapability>;
  supports(gameId: StableGameId, edition: GameEdition, version: string): boolean;
  validate(manifest: InstallationManifestV2): void;
}
