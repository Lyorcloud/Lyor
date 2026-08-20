import { access, constants } from 'node:fs/promises';

import { InstallationEngineError } from './errors';

export interface InstalledDependency {
  readonly modId: string;
  readonly version: string;
  readonly dependencies: readonly string[];
}

export interface PreflightInput {
  readonly authenticated: boolean;
  readonly entitled: boolean;
  readonly published: boolean;
  readonly gameCompatible: boolean;
  readonly gameProcessRunning: boolean;
  readonly requiredBytes: number;
  readonly availableBytes: number;
  readonly writableRoots: readonly string[];
  readonly requiredDependencies: readonly { readonly modId: string; readonly optional: boolean }[];
  readonly installedMods: readonly InstalledDependency[];
  readonly conflicts: readonly string[];
}

export const assertNoDependencyCycle = (mods: readonly InstalledDependency[]): void => {
  const graph = new Map(mods.map((mod) => [mod.modId, mod.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new InstallationEngineError('operation-failed', 'Dependency cycle detected.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of graph.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
};

export const runPreflight = async (input: PreflightInput): Promise<void> => {
  if (!input.authenticated || !input.entitled || !input.published) {
    throw new InstallationEngineError('invalid-request', 'Authorization or publish preflight failed.');
  }
  if (!input.gameCompatible) throw new InstallationEngineError('incompatible-game', 'Game compatibility preflight failed.');
  if (input.gameProcessRunning) throw new InstallationEngineError('operation-failed', 'Game process must be closed.');
  if (input.requiredBytes < 0 || input.availableBytes < input.requiredBytes) {
    throw new InstallationEngineError('operation-failed', 'Insufficient disk space.');
  }
  for (const root of input.writableRoots) await access(root, constants.R_OK | constants.W_OK);
  const installedIds = new Set(input.installedMods.map((mod) => mod.modId));
  if (input.requiredDependencies.some((dependency) => !dependency.optional && !installedIds.has(dependency.modId))) {
    throw new InstallationEngineError('operation-failed', 'A required dependency is missing.');
  }
  if (input.conflicts.some((conflict) => installedIds.has(conflict))) {
    throw new InstallationEngineError('ownership-conflict', 'A conflicting mod is installed.');
  }
  assertNoDependencyCycle(input.installedMods);
};
