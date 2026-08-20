import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, relative } from 'node:path';

import type { InstallationManifestV1, ManifestOperation, ManifestSource } from '../../shared/installation-engine';
import { InstallationEngineError } from './errors';
import type { InstalledPathRecord } from './metadata-store';
import { resolveSafePath } from './path-safety';

export const sha256File = async (filePath: string): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const ensureRegularFile = async (filePath: string): Promise<void> => {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new InstallationEngineError('operation-failed', 'Expected a regular file.');
};

export class GenericFileAdapter {
  async apply(
    packageRoot: string,
    gameRoot: string,
    backupRoot: string,
    manifest: InstallationManifestV1,
  ): Promise<readonly InstalledPathRecord[]> {
    const sources = new Map(manifest.sources.map((source) => [source.id, source]));
    const applied: InstalledPathRecord[] = [];
    await mkdir(backupRoot, { recursive: true });
    try {
      for (const operation of manifest.operations) {
        const records = await this.#applyOperation(packageRoot, gameRoot, backupRoot, operation, sources);
        applied.push(...records);
      }
      return applied;
    } catch (error) {
      await this.rollback(gameRoot, backupRoot, applied);
      throw error;
    }
  }

  async #verifiedSource(packageRoot: string, source: ManifestSource): Promise<string> {
    const sourcePath = await resolveSafePath(packageRoot, source.path);
    await ensureRegularFile(sourcePath);
    if (source.size !== undefined && (await stat(sourcePath)).size !== source.size) {
      throw new InstallationEngineError('integrity-failed', 'Source size did not match the manifest.');
    }
    if (source.sha256 !== undefined && await sha256File(sourcePath) !== source.sha256) {
      throw new InstallationEngineError('integrity-failed', 'Source hash did not match the manifest.');
    }
    return sourcePath;
  }

  async #copyOne(sourcePath: string, targetPath: string): Promise<string> {
    try {
      await stat(targetPath);
      throw new InstallationEngineError('ownership-conflict', 'Target already exists and is not owned by this install.');
    } catch (error) {
      if (error instanceof InstallationEngineError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    return sha256File(targetPath);
  }

  async #walkFiles(root: string, relativeRoot = ''): Promise<readonly string[]> {
    const entries = await readdir(relativeRoot.length === 0 ? root : await resolveSafePath(root, relativeRoot), { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const child = relativeRoot.length === 0 ? entry.name : `${relativeRoot}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new InstallationEngineError('unsafe-path', 'Package folders cannot contain links.');
      if (entry.isDirectory()) results.push(...await this.#walkFiles(root, child));
      else if (entry.isFile()) results.push(child);
      else throw new InstallationEngineError('unsafe-path', 'Package contains an unsupported filesystem entry.');
    }
    return results;
  }

  async #applyOperation(
    packageRoot: string,
    gameRoot: string,
    backupRoot: string,
    operation: ManifestOperation,
    sources: ReadonlyMap<string, ManifestSource>,
  ): Promise<readonly InstalledPathRecord[]> {
    const targetPath = await resolveSafePath(gameRoot, operation.target);
    if (operation.type === 'CREATE_DIRECTORY') {
      try {
        await stat(targetPath);
        throw new InstallationEngineError('ownership-conflict', 'Directory target already exists.');
      } catch (error) {
        if (error instanceof InstallationEngineError) throw error;
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await mkdir(targetPath);
      return [{ operation: operation.type, kind: 'added-directory', relativePath: operation.target,
        installedSha256: null, originalSha256: null, backupRelativePath: null }];
    }
    if (operation.type === 'DELETE_FILE') {
      await ensureRegularFile(targetPath);
      const originalSha256 = await sha256File(targetPath);
      const backupRelativePath = `${originalSha256}.original`;
      const backupPath = await resolveSafePath(backupRoot, backupRelativePath);
      await copyFile(targetPath, backupPath);
      if (await sha256File(backupPath) !== originalSha256) {
        throw new InstallationEngineError('integrity-failed', 'Backup verification failed.');
      }
      await unlink(targetPath);
      return [{ operation: operation.type, kind: 'deleted-file', relativePath: operation.target,
        installedSha256: null, originalSha256, backupRelativePath }];
    }
    const source = operation.source === undefined ? null : sources.get(operation.source);
    if (!source) throw new InstallationEngineError('invalid-manifest', 'Operation source is unavailable.');
    if (operation.type === 'COPY_FOLDER') {
      const sourceFolder = await resolveSafePath(packageRoot, source.path);
      if (!(await stat(sourceFolder)).isDirectory()) throw new InstallationEngineError('operation-failed', 'Folder source is not a directory.');
      const files = await this.#walkFiles(sourceFolder);
      const records: InstalledPathRecord[] = [];
      for (const relativeFile of files) {
        const nestedSource = await resolveSafePath(sourceFolder, relativeFile);
        const nestedTargetPath = await resolveSafePath(gameRoot, `${operation.target}/${relativeFile}`);
        const installedSha256 = await this.#copyOne(nestedSource, nestedTargetPath);
        records.push({ operation: operation.type, kind: 'added-file',
          relativePath: relative(gameRoot, nestedTargetPath).replaceAll('\\', '/'), installedSha256,
          originalSha256: null, backupRelativePath: null });
      }
      return records;
    }
    const sourcePath = await this.#verifiedSource(packageRoot, source);
    if (operation.type === 'COPY_FILE') {
      const installedSha256 = await this.#copyOne(sourcePath, targetPath);
      return [{ operation: operation.type, kind: 'added-file', relativePath: operation.target,
        installedSha256, originalSha256: null, backupRelativePath: null }];
    }
    await ensureRegularFile(targetPath);
    const originalSha256 = await sha256File(targetPath);
    const backupRelativePath = `${originalSha256}.original`;
    const backupPath = await resolveSafePath(backupRoot, backupRelativePath);
    await copyFile(targetPath, backupPath);
    if (await sha256File(backupPath) !== originalSha256) {
      throw new InstallationEngineError('integrity-failed', 'Backup verification failed.');
    }
    await copyFile(sourcePath, targetPath);
    const installedSha256 = await sha256File(targetPath);
    return [{ operation: operation.type, kind: 'replaced-file', relativePath: operation.target,
      installedSha256, originalSha256, backupRelativePath }];
  }

  async rollback(gameRoot: string, backupRoot: string, records: readonly InstalledPathRecord[]): Promise<void> {
    for (const record of [...records].reverse()) {
      const target = await resolveSafePath(gameRoot, record.relativePath);
      if (record.kind === 'added-file') await rm(target, { force: true });
      else if (record.kind === 'added-directory') {
        try { await rmdir(target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      else if (record.backupRelativePath) {
        const backup = await resolveSafePath(backupRoot, record.backupRelativePath);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(backup, target);
      }
    }
  }

  async uninstall(gameRoot: string, backupRoot: string, records: readonly InstalledPathRecord[]): Promise<void> {
    for (const record of [...records].reverse()) {
      const target = await resolveSafePath(gameRoot, record.relativePath);
      if (record.kind === 'added-file' || record.kind === 'replaced-file') {
        let currentHash: string;
        try { currentHash = await sha256File(target); }
        catch { throw new InstallationEngineError('integrity-failed', 'Owned file is missing or unreadable.'); }
        if (currentHash !== record.installedSha256) {
          throw new InstallationEngineError('integrity-failed', 'Owned file changed; destructive uninstall was blocked.');
        }
      }
      if (record.kind === 'deleted-file') {
        try {
          await stat(target);
          throw new InstallationEngineError('integrity-failed', 'Deleted target was recreated; restore was blocked.');
        } catch (error) {
          if (error instanceof InstallationEngineError) throw error;
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
    await this.rollback(gameRoot, backupRoot, records);
  }
}
