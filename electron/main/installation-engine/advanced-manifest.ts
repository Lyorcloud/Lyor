import type { AdapterCapability, AdvancedManifestOperation, InstallationManifestV2 } from '../../shared/game-adapter';
import { ADAPTER_CAPABILITIES, ADVANCED_OPERATION_TYPES } from '../../shared/game-adapter';
import type { InstallationManifestV1 } from '../../shared/installation-engine';
import { InstallationEngineError } from './errors';
import { assertRelativeManifestPath } from './path-safety';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const modId = (value: unknown): value is string => string(value) && /^[a-z0-9][a-z0-9-]*$/u.test(value);

export const parseAdvancedManifest = (value: unknown): InstallationManifestV2 => {
  if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.mod) || !modId(value.mod.id) || !string(value.mod.version, 80) ||
      !isRecord(value.game) || !string(value.game.id) || !['legacy', 'enhanced', 'standard'].includes(String(value.game.edition)) ||
      !string(value.adapter) || !Array.isArray(value.requiredCapabilities) ||
      !value.requiredCapabilities.every((capability) => ADAPTER_CAPABILITIES.includes(capability as never)) ||
      !Array.isArray(value.sources) || !Array.isArray(value.operations) || value.operations.length === 0 ||
      !Array.isArray(value.dependencies) || !Array.isArray(value.conflicts) || !Number.isSafeInteger(value.installedSize)) {
    throw new InstallationEngineError('invalid-manifest', 'Advanced manifest is invalid.');
  }
  const sources = value.sources.map((source) => {
    if (!isRecord(source) || !string(source.id) || !string(source.path, 1024) || !sha(source.sha256)) {
      throw new InstallationEngineError('invalid-manifest', 'Advanced source is invalid.');
    }
    assertRelativeManifestPath(source.path);
    return { id: source.id, path: source.path, sha256: source.sha256 };
  });
  if (new Set(sources.map((source) => source.id)).size !== sources.length) throw new InstallationEngineError('invalid-manifest', 'Duplicate source ID.');
  const sourceIds = new Set(sources.map((source) => source.id));
  const operations = value.operations.map((operation): AdvancedManifestOperation => {
    if (!isRecord(operation) || !ADVANCED_OPERATION_TYPES.includes(operation.type as never) || !string(operation.target, 1024)) {
      throw new InstallationEngineError('invalid-manifest', 'Advanced operation is invalid.');
    }
    assertRelativeManifestPath(operation.target);
    if (operation.entry !== undefined) {
      if (!string(operation.entry, 1024)) throw new InstallationEngineError('invalid-manifest', 'Archive entry is invalid.');
      assertRelativeManifestPath(operation.entry);
    }
    if (operation.source !== undefined && (!string(operation.source) || !sourceIds.has(operation.source))) {
      throw new InstallationEngineError('invalid-manifest', 'Advanced operation source is invalid.');
    }
    const needsSource = ['ARCHIVE_ADD', 'ARCHIVE_REPLACE', 'CONFIG_MERGE'].includes(String(operation.type));
    const needsEntry = String(operation.type).startsWith('ARCHIVE_');
    if (needsSource !== (operation.source !== undefined) || needsEntry !== (operation.entry !== undefined)) {
      throw new InstallationEngineError('invalid-manifest', 'Advanced operation fields do not match its type.');
    }
    if (operation.type === 'CONFIG_MERGE' && operation.format !== 'json') {
      throw new InstallationEngineError('invalid-manifest', 'Only deterministic JSON config merge is supported.');
    }
    return { type: operation.type as AdvancedManifestOperation['type'], target: operation.target,
      ...(operation.entry === undefined ? {} : { entry: operation.entry }),
      ...(operation.source === undefined ? {} : { source: operation.source }),
      ...(operation.format === undefined ? {} : { format: 'json' as const }) };
  });
  return {
    schemaVersion: 2,
    mod: { id: value.mod.id, version: value.mod.version },
    game: { id: value.game.id as InstallationManifestV2['game']['id'], edition: value.game.edition as InstallationManifestV2['game']['edition'],
      ...(string(value.game.versionRange, 80) ? { versionRange: value.game.versionRange } : {}) },
    adapter: value.adapter,
    requiredCapabilities: value.requiredCapabilities as AdapterCapability[],
    sources, operations,
    dependencies: value.dependencies as InstallationManifestV2['dependencies'],
    conflicts: value.conflicts as string[], installedSize: Number(value.installedSize),
  };
};

export const migrateManifestV1 = (manifest: InstallationManifestV1): InstallationManifestV1 => ({ ...manifest });
