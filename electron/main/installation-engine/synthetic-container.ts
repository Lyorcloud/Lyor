import { createHash } from 'node:crypto';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';

import type { ArchiveEntryInfo, ArchiveHandler } from '../../shared/game-adapter';
import { InstallationEngineError } from './errors';
import { assertRelativeManifestPath } from './path-safety';

interface SyntheticContainerFile {
  readonly format: 'lyor-synthetic-container-v1';
  readonly entries: readonly { readonly path: string; readonly data: string; readonly sha256: string }[];
}

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const MAX_CONTAINER_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 4096;

export class SyntheticContainerHandler implements ArchiveHandler {
  #path: string | null = null;
  #entries = new Map<string, Uint8Array>();

  async open(path: string): Promise<void> {
    const raw = await readFile(path);
    if (raw.length > MAX_CONTAINER_BYTES) throw new InstallationEngineError('integrity-failed', 'Container resource limit exceeded.');
    let parsed: SyntheticContainerFile;
    try { parsed = JSON.parse(raw.toString('utf8')) as SyntheticContainerFile; }
    catch { throw new InstallationEngineError('integrity-failed', 'Container is corrupt.'); }
    if (parsed.format !== 'lyor-synthetic-container-v1' || !Array.isArray(parsed.entries) || parsed.entries.length > MAX_ENTRIES) {
      throw new InstallationEngineError('integrity-failed', 'Unsupported synthetic container.');
    }
    const entries = new Map<string, Uint8Array>();
    const folded = new Set<string>();
    for (const entry of parsed.entries) {
      assertRelativeManifestPath(entry.path);
      const collisionKey = entry.path.toLocaleLowerCase('en-US');
      if (folded.has(collisionKey)) throw new InstallationEngineError('integrity-failed', 'Duplicate or case-colliding container entry.');
      const bytes = Buffer.from(entry.data, 'base64');
      if (bytes.length > MAX_ENTRY_BYTES || hash(bytes) !== entry.sha256) throw new InstallationEngineError('integrity-failed', 'Container entry verification failed.');
      folded.add(collisionKey);
      entries.set(entry.path, bytes);
    }
    this.#path = path;
    this.#entries = entries;
  }

  inspect(): readonly ArchiveEntryInfo[] {
    return [...this.#entries].map(([path, bytes]) => ({ path, size: bytes.length, sha256: hash(bytes) }));
  }
  read(entryPath: string): Uint8Array {
    const value = this.#entries.get(entryPath);
    if (!value) throw new InstallationEngineError('operation-failed', 'Archive entry was not found.');
    return Uint8Array.from(value);
  }
  add(entryPath: string, bytes: Uint8Array): void {
    this.#assertEntry(entryPath, bytes);
    if ([...this.#entries.keys()].some((path) => path.toLocaleLowerCase('en-US') === entryPath.toLocaleLowerCase('en-US'))) {
      throw new InstallationEngineError('ownership-conflict', 'Archive entry already exists or case-collides.');
    }
    this.#entries.set(entryPath, Uint8Array.from(bytes));
  }
  replace(entryPath: string, bytes: Uint8Array): void {
    this.#assertEntry(entryPath, bytes);
    if (!this.#entries.has(entryPath)) throw new InstallationEngineError('operation-failed', 'Archive replacement target does not exist.');
    this.#entries.set(entryPath, Uint8Array.from(bytes));
  }
  delete(entryPath: string): void {
    if (!this.#entries.delete(entryPath)) throw new InstallationEngineError('operation-failed', 'Archive deletion target does not exist.');
  }
  async backup(destinationPath: string): Promise<string> {
    if (!this.#path) throw new InstallationEngineError('operation-failed', 'Container is not open.');
    await copyFile(this.#path, destinationPath);
    return hash(await readFile(destinationPath));
  }
  async verify(): Promise<void> {
    for (const entry of this.inspect()) {
      if (entry.sha256 !== hash(this.read(entry.path))) throw new InstallationEngineError('integrity-failed', 'Container verification failed.');
    }
  }
  async commit(): Promise<void> {
    if (!this.#path) throw new InstallationEngineError('operation-failed', 'Container is not open.');
    await this.verify();
    const value: SyntheticContainerFile = {
      format: 'lyor-synthetic-container-v1',
      entries: [...this.#entries].sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => ({
        path, data: Buffer.from(bytes).toString('base64'), sha256: hash(bytes),
      })),
    };
    const temporary = `${this.#path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, this.#path);
  }
  #assertEntry(entryPath: string, bytes: Uint8Array): void {
    assertRelativeManifestPath(entryPath);
    if (bytes.length > MAX_ENTRY_BYTES) throw new InstallationEngineError('integrity-failed', 'Archive entry resource limit exceeded.');
  }
}

export const createSyntheticContainer = async (path: string, entries: Readonly<Record<string, string>>): Promise<void> => {
  const value: SyntheticContainerFile = {
    format: 'lyor-synthetic-container-v1',
    entries: Object.entries(entries).map(([entryPath, data]) => {
      assertRelativeManifestPath(entryPath);
      const bytes = Buffer.from(data);
      return { path: entryPath, data: bytes.toString('base64'), sha256: hash(bytes) };
    }),
  };
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};
