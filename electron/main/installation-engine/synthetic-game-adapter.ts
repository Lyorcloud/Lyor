import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';

import type { AdapterCapability, GameAdapter, InstallationManifestV2 } from '../../shared/game-adapter';
import type { GameEdition, StableGameId } from '../../shared/installation-engine';
import { InstallationEngineError } from './errors';
import { sha256File } from './generic-file-adapter';
import { resolveSafePath } from './path-safety';
import { SyntheticContainerHandler } from './synthetic-container';

interface AdvancedApplyRecord {
  readonly targetPath: string;
  readonly backupPath: string;
  readonly originalSha256: string;
  readonly modifiedSha256: string;
}

const deterministicJsonMerge = (original: unknown, patch: unknown): unknown => {
  if (typeof original !== 'object' || original === null || Array.isArray(original) ||
      typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new InstallationEngineError('ownership-conflict', 'Config merge requires JSON objects.');
  }
  const result: Record<string, unknown> = { ...(original as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) {
    if (key in result && JSON.stringify(result[key]) !== JSON.stringify(value)) {
      throw new InstallationEngineError('ownership-conflict', 'Config merge found an existing conflicting key.');
    }
    result[key] = value;
  }
  return result;
};

export class SyntheticGameAdapter implements GameAdapter {
  readonly id = 'synthetic-container-fixture';
  readonly capabilities: ReadonlySet<AdapterCapability> = new Set([
    'archive-operations', 'config-merge', 'version-detection', 'validation',
  ]);

  supports(gameId: StableGameId, edition: GameEdition, version: string): boolean {
    return gameId === 'game-synthetic-fixture' && edition === 'standard' && /^1\./u.test(version);
  }

  validate(manifest: InstallationManifestV2): void {
    if (manifest.adapter !== this.id) throw new InstallationEngineError('invalid-manifest', 'Manifest selects another adapter.');
    for (const capability of manifest.requiredCapabilities) {
      if (!this.capabilities.has(capability)) throw new InstallationEngineError('invalid-manifest', 'Adapter capability is unsupported.');
    }
  }

  async apply(gameRoot: string, packageRoot: string, backupRoot: string, manifest: InstallationManifestV2): Promise<readonly AdvancedApplyRecord[]> {
    this.validate(manifest);
    const sources = new Map(manifest.sources.map((source) => [source.id, source]));
    const records: AdvancedApplyRecord[] = [];
    try {
      for (let index = 0; index < manifest.operations.length; index += 1) {
        const operation = manifest.operations[index];
        if (!operation) continue;
        const targetPath = await resolveSafePath(gameRoot, operation.target);
        const backupPath = await resolveSafePath(backupRoot, `${index}.original`);
        await copyFile(targetPath, backupPath);
        const originalSha256 = await sha256File(backupPath);
        if (operation.type === 'CONFIG_MERGE') {
          const source = operation.source ? sources.get(operation.source) : null;
          if (!source) throw new InstallationEngineError('invalid-manifest', 'Config source is unavailable.');
          const sourcePath = await resolveSafePath(packageRoot, source.path);
          if (await sha256File(sourcePath) !== source.sha256) throw new InstallationEngineError('integrity-failed', 'Config source hash mismatch.');
          let merged: unknown;
          try {
            merged = deterministicJsonMerge(JSON.parse(await readFile(targetPath, 'utf8')), JSON.parse(await readFile(sourcePath, 'utf8')));
          } catch (error) {
            if (error instanceof InstallationEngineError) throw error;
            throw new InstallationEngineError('integrity-failed', 'Config JSON is malformed.');
          }
          const temporary = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
          await writeFile(temporary, `${JSON.stringify(merged, Object.keys(merged as object).sort(), 2)}\n`);
          await rename(temporary, targetPath);
        } else {
          if (!operation.entry) throw new InstallationEngineError('invalid-manifest', 'Archive entry is unavailable.');
          const handler = new SyntheticContainerHandler();
          await handler.open(targetPath);
          if (operation.type === 'ARCHIVE_DELETE') handler.delete(operation.entry);
          else {
            const source = operation.source ? sources.get(operation.source) : null;
            if (!source) throw new InstallationEngineError('invalid-manifest', 'Archive source is unavailable.');
            const sourcePath = await resolveSafePath(packageRoot, source.path);
            if (await sha256File(sourcePath) !== source.sha256) throw new InstallationEngineError('integrity-failed', 'Archive source hash mismatch.');
            const bytes = await readFile(sourcePath);
            if (operation.type === 'ARCHIVE_ADD') handler.add(operation.entry, bytes);
            else handler.replace(operation.entry, bytes);
          }
          await handler.verify();
          await handler.commit();
        }
        records.push({ targetPath, backupPath, originalSha256, modifiedSha256: await sha256File(targetPath) });
      }
      return records;
    } catch (error) {
      await this.rollback(records);
      throw error;
    }
  }

  async rollback(records: readonly AdvancedApplyRecord[]): Promise<void> {
    for (const record of [...records].reverse()) {
      if (await sha256File(record.backupPath) !== record.originalSha256) {
        throw new InstallationEngineError('integrity-failed', 'Advanced adapter backup is corrupt.');
      }
      await copyFile(record.backupPath, record.targetPath);
    }
  }

  async uninstall(records: readonly AdvancedApplyRecord[]): Promise<void> {
    const finalByTarget = new Map(records.map((record) => [record.targetPath, record]));
    for (const record of finalByTarget.values()) {
      if (await sha256File(record.targetPath) !== record.modifiedSha256) {
        throw new InstallationEngineError('integrity-failed', 'Advanced target changed; uninstall was blocked.');
      }
    }
    await this.rollback(records);
  }
}
