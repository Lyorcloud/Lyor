import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { InstallationEngineError } from './errors';

const WINDOWS_DRIVE = /^[a-zA-Z]:/u;

export const assertRelativeManifestPath = (value: string): void => {
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.includes('\0') ||
    isAbsolute(value) ||
    WINDOWS_DRIVE.test(value) ||
    normalized.startsWith('/') ||
    segments.some((segment) => segment === '..' || segment === '' || segment === '.')
  ) {
    throw new InstallationEngineError('unsafe-path', 'Manifest path is not a safe relative path.');
  }
};

const isContained = (root: string, candidate: string): boolean => {
  const delta = relative(root, candidate);
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..' && !isAbsolute(delta));
};

export const resolveSafePath = async (
  rootPath: string,
  manifestPath: string,
): Promise<string> => {
  assertRelativeManifestPath(manifestPath);
  const canonicalRoot = await realpath(rootPath);
  const candidate = resolve(canonicalRoot, manifestPath);
  if (!isContained(canonicalRoot, candidate)) {
    throw new InstallationEngineError('unsafe-path', 'Resolved path escaped its approved root.');
  }

  const segments = manifestPath.replaceAll('\\', '/').split('/');
  let cursor = canonicalRoot;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) {
        throw new InstallationEngineError('unsafe-path', 'Symbolic links and reparse points are not allowed.');
      }
      const canonicalCursor = await realpath(cursor);
      if (!isContained(canonicalRoot, canonicalCursor)) {
        throw new InstallationEngineError('unsafe-path', 'Existing path escaped its approved root.');
      }
    } catch (error) {
      if (error instanceof InstallationEngineError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return candidate;
};
