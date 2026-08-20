import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GameEdition, ManifestOperationType, StableGameId } from '../../shared/installation-engine';

export type InstalledPathKind = 'added-file' | 'added-directory' | 'replaced-file' | 'deleted-file';

export interface InstalledPathRecord {
  readonly operation: ManifestOperationType;
  readonly kind: InstalledPathKind;
  readonly relativePath: string;
  readonly installedSha256: string | null;
  readonly originalSha256: string | null;
  readonly backupRelativePath: string | null;
}

export interface InstallationRecordV1 {
  readonly schemaVersion: 1;
  readonly modId: string;
  readonly modVersion: string;
  readonly gameDetectionId: string;
  readonly gameId: StableGameId;
  readonly edition: GameEdition;
  readonly gameVersion: string;
  readonly manifestSha256: string;
  readonly installedAt: string;
  readonly paths: readonly InstalledPathRecord[];
}

const safeSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/gu, '_');

export class InstallationMetadataStore {
  readonly installationsRoot: string;
  readonly backupsRoot: string;

  constructor(readonly rootPath: string) {
    this.installationsRoot = join(rootPath, 'installations');
    this.backupsRoot = join(rootPath, 'backups');
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.installationsRoot, { recursive: true }),
      mkdir(this.backupsRoot, { recursive: true }),
    ]);
  }

  getBackupRoot(gameDetectionId: string, modId: string): string {
    return join(this.backupsRoot, safeSegment(gameDetectionId), safeSegment(modId));
  }

  #recordPath(gameDetectionId: string, modId: string): string {
    return join(this.installationsRoot, `${safeSegment(gameDetectionId)}--${safeSegment(modId)}.json`);
  }

  async read(gameDetectionId: string, modId: string): Promise<InstallationRecordV1 | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#recordPath(gameDetectionId, modId), 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) {
        throw new Error('Unsupported installation metadata.');
      }
      return parsed as InstallationRecordV1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(record: InstallationRecordV1): Promise<void> {
    await this.initialize();
    const target = this.#recordPath(record.gameDetectionId, record.modId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  }

  async remove(gameDetectionId: string, modId: string): Promise<void> {
    try {
      await unlink(this.#recordPath(gameDetectionId, modId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async list(): Promise<readonly InstallationRecordV1[]> {
    await this.initialize();
    const { readdir } = await import('node:fs/promises');
    const names = await readdir(this.installationsRoot);
    const records: InstallationRecordV1[] = [];
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      const parsed = JSON.parse(await readFile(join(this.installationsRoot, name), 'utf8')) as InstallationRecordV1;
      if (parsed.schemaVersion === 1) records.push(parsed);
    }
    return records;
  }
}
