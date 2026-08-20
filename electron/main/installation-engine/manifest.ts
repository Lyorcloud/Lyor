import type {
  GameEdition,
  InstallationManifestV1,
  ManifestOperation,
  ManifestSource,
  StableGameId,
} from '../../shared/installation-engine';
import { MANIFEST_OPERATION_TYPES } from '../../shared/installation-engine';
import { InstallationEngineError } from './errors';
import { assertRelativeManifestPath } from './path-safety';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
};
const boundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const isModId = (value: unknown): value is string =>
  boundedString(value, 120) && /^[a-z0-9][a-z0-9-]*$/u.test(value);
const isSourceId = (value: unknown): value is string =>
  boundedString(value, 120) && /^[a-zA-Z0-9_-]+$/u.test(value);
const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const FORBIDDEN_EXECUTABLE_EXTENSION = /\.(?:bat|cmd|com|exe|msi|ps1|scr)$/iu;

const parseSource = (value: unknown): ManifestSource => {
  if (!isRecord(value) || !exactKeys(value, ['id', 'path'], ['sha256', 'size']) ||
      !isSourceId(value.id) || !boundedString(value.path, 1024) ||
      !(value.sha256 === undefined || isSha256(value.sha256)) ||
      !(value.size === undefined || (Number.isSafeInteger(value.size) && Number(value.size) >= 0))) {
    throw new InstallationEngineError('invalid-manifest', 'Invalid manifest source.');
  }
  assertRelativeManifestPath(value.path);
  if (FORBIDDEN_EXECUTABLE_EXTENSION.test(value.path)) {
    throw new InstallationEngineError('invalid-manifest', 'Executable and script payloads are forbidden.');
  }
  return { id: value.id, path: value.path, ...(value.sha256 === undefined ? {} : { sha256: value.sha256 }),
    ...(value.size === undefined ? {} : { size: Number(value.size) }) };
};

const parseOperation = (value: unknown): ManifestOperation => {
  if (!isRecord(value) || !exactKeys(value, ['type', 'target'], ['source']) ||
      typeof value.type !== 'string' || !MANIFEST_OPERATION_TYPES.includes(value.type as never) ||
      !boundedString(value.target, 1024) || !(value.source === undefined || isSourceId(value.source))) {
    throw new InstallationEngineError('invalid-manifest', 'Invalid manifest operation.');
  }
  const requiresSource = ['COPY_FILE', 'COPY_FOLDER', 'REPLACE_FILE'].includes(value.type);
  if (requiresSource !== (value.source !== undefined)) {
    throw new InstallationEngineError('invalid-manifest', 'Operation source does not match its operation type.');
  }
  assertRelativeManifestPath(value.target);
  if (FORBIDDEN_EXECUTABLE_EXTENSION.test(value.target)) {
    throw new InstallationEngineError('invalid-manifest', 'Executable and script targets are forbidden.');
  }
  return { type: value.type as ManifestOperation['type'], target: value.target,
    ...(value.source === undefined ? {} : { source: value.source }) };
};

export const parseInstallationManifest = (value: unknown): InstallationManifestV1 => {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion', 'mod', 'game', 'adapter', 'sources', 'operations', 'dependencies',
    'conflicts', 'checksums', 'installedSize',
  ]) || value.schemaVersion !== 1 || value.adapter !== 'generic-files' ||
      !isRecord(value.mod) || !exactKeys(value.mod, ['id', 'version']) ||
      !isModId(value.mod.id) || !boundedString(value.mod.version, 80) ||
      !isRecord(value.game) || !exactKeys(value.game, ['id', 'edition'], ['versionRange']) ||
      !boundedString(value.game.id, 120) || !/^(gta5-(legacy|enhanced)|game-[a-z0-9-]+)$/u.test(value.game.id) ||
      !['legacy', 'enhanced', 'standard'].includes(String(value.game.edition)) ||
      !(value.game.versionRange === undefined || boundedString(value.game.versionRange, 80)) ||
      !Array.isArray(value.sources) || value.sources.length > 10000 ||
      !Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 10000 ||
      !Array.isArray(value.dependencies) || !Array.isArray(value.conflicts) ||
      !isRecord(value.checksums) || !exactKeys(value.checksums, ['algorithm']) || value.checksums.algorithm !== 'sha256' ||
      !Number.isSafeInteger(value.installedSize) || Number(value.installedSize) < 0) {
    throw new InstallationEngineError('invalid-manifest', 'Manifest does not match schema version 1.');
  }
  const sources = value.sources.map(parseSource);
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new InstallationEngineError('invalid-manifest', 'Manifest source IDs must be unique.');
  }
  const operations = value.operations.map(parseOperation);
  const sourceIds = new Set(sources.map((source) => source.id));
  if (operations.some((operation) => operation.source !== undefined && !sourceIds.has(operation.source))) {
    throw new InstallationEngineError('invalid-manifest', 'Operation references an unknown source.');
  }
  const dependencies = value.dependencies.map((dependency) => {
    if (!isRecord(dependency) || !exactKeys(dependency, ['modId', 'versionRange', 'optional']) ||
        !isModId(dependency.modId) || !boundedString(dependency.versionRange, 80) || typeof dependency.optional !== 'boolean') {
      throw new InstallationEngineError('invalid-manifest', 'Invalid dependency metadata.');
    }
    return { modId: dependency.modId, versionRange: dependency.versionRange, optional: dependency.optional };
  });
  if (!value.conflicts.every(isModId) || new Set(value.conflicts).size !== value.conflicts.length) {
    throw new InstallationEngineError('invalid-manifest', 'Invalid conflict metadata.');
  }
  return {
    schemaVersion: 1,
    mod: { id: value.mod.id, version: value.mod.version },
    game: { id: value.game.id as StableGameId, edition: value.game.edition as GameEdition,
      ...(value.game.versionRange === undefined ? {} : { versionRange: value.game.versionRange }) },
    adapter: 'generic-files', sources, operations, dependencies, conflicts: value.conflicts,
    checksums: { algorithm: 'sha256' }, installedSize: Number(value.installedSize),
  };
};
