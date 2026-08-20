import { createHash } from 'node:crypto';
import { mkdir, realpath, rm, stat } from 'node:fs/promises';

import type {
  InstallationEngineResult,
  InstallationEngineState,
  InstallationManifestV1,
  InstallationTarget,
  UninstallTarget,
  VerifiedGameInstallation,
} from '../../shared/installation-engine';
import { InstallationEngineError } from './errors';
import { GameDetectionRegistry } from './game-detection';
import { GenericFileAdapter } from './generic-file-adapter';
import { parseInstallationManifest } from './manifest';
import { InstallationMetadataStore, type InstallationRecordV1 } from './metadata-store';

export interface ApprovedPackageInput {
  readonly packageInputId: string;
  readonly packageRoot: string;
  readonly manifest: unknown;
}

const safeResult = (
  disposition: InstallationEngineResult['disposition'],
  record: Pick<InstallationRecordV1, 'modId' | 'modVersion'> | null,
  error: InstallationEngineError | null = null,
): InstallationEngineResult => ({
  ok: error === null,
  disposition,
  modId: record?.modId ?? null,
  version: record?.modVersion ?? null,
  error: error === null ? null : { code: error.code, message: error.message },
});

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10));
  if (leftParts.some(Number.isNaN) || rightParts.some(Number.isNaN)) return left.localeCompare(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  return 0;
};

const satisfiesVersionRange = (version: string, range: string | undefined): boolean => {
  if (range === undefined || range === '*') return true;
  return range.split(/\s*,\s*/u).every((clause) => {
    const match = /^(<=|>=|<|>|=)?\s*([0-9]+(?:\.[0-9]+)*)$/u.exec(clause);
    if (!match) return false;
    const comparison = compareVersions(version, match[2] ?? '');
    switch (match[1] ?? '=') {
      case '<': return comparison < 0;
      case '<=': return comparison <= 0;
      case '>': return comparison > 0;
      case '>=': return comparison >= 0;
      default: return comparison === 0;
    }
  });
};

const manifestHash = (manifest: InstallationManifestV1): string =>
  createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

export class InstallationEngineService {
  readonly detections = new GameDetectionRegistry();
  readonly metadata: InstallationMetadataStore;
  readonly #packages = new Map<string, ApprovedPackageInput>();
  readonly #adapter = new GenericFileAdapter();

  constructor(stateRoot: string) {
    this.metadata = new InstallationMetadataStore(stateRoot);
  }

  registerVerifiedGame(detection: VerifiedGameInstallation): void {
    this.detections.register(detection);
  }

  async registerApprovedPackage(input: ApprovedPackageInput): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{1,120}$/u.test(input.packageInputId)) {
      throw new InstallationEngineError('invalid-request', 'Invalid approved package input ID.');
    }
    const canonicalRoot = await realpath(input.packageRoot);
    if (!(await stat(canonicalRoot)).isDirectory()) {
      throw new InstallationEngineError('package-not-found', 'Approved package root is not a directory.');
    }
    const manifest = parseInstallationManifest(input.manifest);
    this.#packages.set(input.packageInputId, { ...input, packageRoot: canonicalRoot, manifest });
  }

  async getState(): Promise<InstallationEngineState> {
    const records = await this.metadata.list();
    return {
      detections: this.detections.list().map((detection) => ({
        detectionId: detection.detectionId,
        gameId: detection.gameId,
        store: detection.store,
        edition: detection.edition,
        version: detection.version,
        verified: true,
      })),
      installed: records.map((record) => ({
        modId: record.modId,
        version: record.modVersion,
        gameId: record.gameId,
        edition: record.edition,
      })),
    };
  }

  async install(input: InstallationTarget): Promise<InstallationEngineResult> {
    try {
      if (!/^[a-zA-Z0-9_-]{1,120}$/u.test(input.gameDetectionId) ||
          !/^[a-zA-Z0-9_-]{1,120}$/u.test(input.packageInputId)) {
        throw new InstallationEngineError('invalid-request', 'Install request IDs are invalid.');
      }
      const game = this.detections.get(input.gameDetectionId);
      if (!game) throw new InstallationEngineError('game-not-found', 'Verified game detection was not found.');
      const packageInput = this.#packages.get(input.packageInputId);
      if (!packageInput) throw new InstallationEngineError('package-not-found', 'Approved package input was not found.');
      const manifest = parseInstallationManifest(packageInput.manifest);
      if (manifest.game.id !== game.gameId) throw new InstallationEngineError('incompatible-game', 'Package targets another game.');
      if (manifest.game.edition !== game.edition) throw new InstallationEngineError('incompatible-edition', 'Package targets another game edition.');
      if (!satisfiesVersionRange(game.version, manifest.game.versionRange)) {
        throw new InstallationEngineError('incompatible-version', 'Installed game version is outside the package range.');
      }
      const existing = await this.metadata.read(game.detectionId, manifest.mod.id);
      if (existing) {
        if (existing.modVersion === manifest.mod.version && existing.manifestSha256 === manifestHash(manifest)) {
          return safeResult('already-installed', existing,
            new InstallationEngineError('already-installed', 'This exact mod version is already installed.'));
        }
        const disposition = compareVersions(existing.modVersion, manifest.mod.version) < 0
          ? 'update-available' : 'reinstall-required';
        return safeResult(disposition, existing,
          new InstallationEngineError('already-installed', 'Existing installation must be removed before applying this package.'));
      }
      const backupRoot = this.metadata.getBackupRoot(game.detectionId, manifest.mod.id);
      await mkdir(backupRoot, { recursive: true });
      const paths = await this.#adapter.apply(packageInput.packageRoot, game.rootPath, backupRoot, manifest);
      const record: InstallationRecordV1 = {
        schemaVersion: 1,
        modId: manifest.mod.id,
        modVersion: manifest.mod.version,
        gameDetectionId: game.detectionId,
        gameId: game.gameId,
        edition: game.edition,
        gameVersion: game.version,
        manifestSha256: manifestHash(manifest),
        installedAt: new Date().toISOString(),
        paths,
      };
      try {
        await this.metadata.write(record);
      } catch (error) {
        await this.#adapter.rollback(game.rootPath, backupRoot, paths);
        throw error;
      }
      return safeResult('not-installed', record);
    } catch (error) {
      const safeError = error instanceof InstallationEngineError
        ? error : new InstallationEngineError('operation-failed', 'Installation operation failed safely.');
      return safeResult('not-installed', null, safeError);
    }
  }

  async uninstall(input: UninstallTarget): Promise<InstallationEngineResult> {
    try {
      if (!/^[a-zA-Z0-9_-]{1,120}$/u.test(input.gameDetectionId) ||
          !/^[a-z0-9][a-z0-9-]{0,119}$/u.test(input.modId)) {
        throw new InstallationEngineError('invalid-request', 'Uninstall request IDs are invalid.');
      }
      const game = this.detections.get(input.gameDetectionId);
      if (!game) throw new InstallationEngineError('game-not-found', 'Verified game detection was not found.');
      const record = await this.metadata.read(game.detectionId, input.modId);
      if (!record) throw new InstallationEngineError('not-installed', 'Owned installation metadata was not found.');
      if (record.gameId !== game.gameId || record.edition !== game.edition) {
        throw new InstallationEngineError('ownership-conflict', 'Installation ownership does not match this game.');
      }
      const backupRoot = this.metadata.getBackupRoot(game.detectionId, record.modId);
      await this.#adapter.uninstall(game.rootPath, backupRoot, record.paths);
      await this.metadata.remove(game.detectionId, record.modId);
      await rm(backupRoot, { recursive: true, force: true });
      return safeResult('not-installed', record);
    } catch (error) {
      const safeError = error instanceof InstallationEngineError
        ? error : new InstallationEngineError('operation-failed', 'Uninstall operation failed safely.');
      return safeResult('reinstall-required', null, safeError);
    }
  }
}
