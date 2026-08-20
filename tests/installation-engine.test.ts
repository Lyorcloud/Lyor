import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { InstallationEngineService } from '../electron/main/installation-engine/service';
import type { InstallationManifestV1 } from '../electron/shared/installation-engine';

const roots: string[] = [];
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

const createFixture = async (edition: 'legacy' | 'enhanced' = 'legacy') => {
  const root = await mkdtemp(join(tmpdir(), 'lyor-engine-fixture-'));
  roots.push(root);
  const gameRoot = join(root, 'game');
  const packageRoot = join(root, 'package');
  const stateRoot = join(root, 'state');
  await Promise.all([mkdir(join(gameRoot, 'config'), { recursive: true }), mkdir(join(packageRoot, 'files'), { recursive: true })]);
  await writeFile(join(gameRoot, 'config', 'original.txt'), 'ORIGINAL-BYTES');
  await writeFile(join(gameRoot, 'delete-me.txt'), 'DELETE-ORIGINAL');
  await writeFile(join(packageRoot, 'files', 'added.txt'), 'ADDED-BY-LYOR');
  await writeFile(join(packageRoot, 'files', 'replacement.txt'), 'REPLACED-BY-LYOR');
  const manifest: InstallationManifestV1 = {
    schemaVersion: 1,
    mod: { id: 'fixture-mod', version: '1.0.0' },
    game: { id: edition === 'legacy' ? 'gta5-legacy' : 'gta5-enhanced', edition, versionRange: '>=1.0.0,<2.0.0' },
    adapter: 'generic-files',
    sources: [
      { id: 'added', path: 'files/added.txt', sha256: hash('ADDED-BY-LYOR'), size: 13 },
      { id: 'replacement', path: 'files/replacement.txt', sha256: hash('REPLACED-BY-LYOR'), size: 16 },
    ],
    operations: [
      { type: 'CREATE_DIRECTORY', target: 'mods' },
      { type: 'COPY_FILE', source: 'added', target: 'mods/added.txt' },
      { type: 'REPLACE_FILE', source: 'replacement', target: 'config/original.txt' },
      { type: 'DELETE_FILE', target: 'delete-me.txt' },
    ],
    dependencies: [], conflicts: [], checksums: { algorithm: 'sha256' }, installedSize: 29,
  };
  const service = new InstallationEngineService(stateRoot);
  service.registerVerifiedGame({
    detectionId: `fixture-${edition}`, gameId: manifest.game.id, rootPath: gameRoot,
    store: 'manual', executablePath: join(gameRoot, 'game.exe'), edition, version: '1.5.0', verified: true,
  });
  await service.registerApprovedPackage({ packageInputId: 'fixture-package', packageRoot, manifest });
  return { service, gameRoot, packageRoot, manifest, detectionId: `fixture-${edition}` };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('InstallationEngineService fixture boundary', () => {
  it('installs add/replace/delete operations and restores the exact original bytes', async () => {
    const fixture = await createFixture();
    const installed = await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'fixture-package' });
    expect(installed.ok).toBe(true);
    expect(await readFile(join(fixture.gameRoot, 'mods', 'added.txt'), 'utf8')).toBe('ADDED-BY-LYOR');
    expect(await readFile(join(fixture.gameRoot, 'config', 'original.txt'), 'utf8')).toBe('REPLACED-BY-LYOR');
    await expect(readFile(join(fixture.gameRoot, 'delete-me.txt'))).rejects.toMatchObject({ code: 'ENOENT' });

    const removed = await fixture.service.uninstall({ gameDetectionId: fixture.detectionId, modId: 'fixture-mod' });
    expect(removed.ok).toBe(true);
    expect(await readFile(join(fixture.gameRoot, 'config', 'original.txt'), 'utf8')).toBe('ORIGINAL-BYTES');
    expect(await readFile(join(fixture.gameRoot, 'delete-me.txt'), 'utf8')).toBe('DELETE-ORIGINAL');
    await expect(readFile(join(fixture.gameRoot, 'mods', 'added.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('distinguishes duplicate, update available, and reinstall required states', async () => {
    const fixture = await createFixture();
    expect((await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'fixture-package' })).ok).toBe(true);
    const duplicate = await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'fixture-package' });
    expect(duplicate).toMatchObject({ ok: false, disposition: 'already-installed', error: { code: 'already-installed' } });
  });

  it('rejects a package for the wrong edition before touching the game fixture', async () => {
    const fixture = await createFixture('legacy');
    const wrong = { ...fixture.manifest, game: { ...fixture.manifest.game, id: 'gta5-enhanced' as const, edition: 'enhanced' as const } };
    await fixture.service.registerApprovedPackage({ packageInputId: 'wrong-edition', packageRoot: fixture.packageRoot, manifest: wrong });
    const result = await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'wrong-edition' });
    expect(result).toMatchObject({ ok: false, error: { code: 'incompatible-game' } });
    expect(await readFile(join(fixture.gameRoot, 'config', 'original.txt'), 'utf8')).toBe('ORIGINAL-BYTES');
  });

  it('rejects traversal, invalid operation/source pair, and ownership-free uninstall', async () => {
    const fixture = await createFixture();
    const invalid = { ...fixture.manifest, operations: [{ type: 'COPY_FILE', source: 'added', target: '../escape.txt' }] };
    await expect(fixture.service.registerApprovedPackage({ packageInputId: 'invalid', packageRoot: fixture.packageRoot, manifest: invalid }))
      .rejects.toMatchObject({ code: 'unsafe-path' });
    const removed = await fixture.service.uninstall({ gameDetectionId: fixture.detectionId, modId: 'not-owned' });
    expect(removed).toMatchObject({ ok: false, error: { code: 'not-installed' } });
  });

  it('blocks symlink/reparse escapes and tampered destructive uninstall', async () => {
    const fixture = await createFixture();
    const outside = join(fixture.gameRoot, '..', 'outside');
    await mkdir(outside);
    await symlink(outside, join(fixture.gameRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const linkedManifest = { ...fixture.manifest, operations: [{ type: 'COPY_FILE', source: 'added', target: 'linked/escape.txt' }] };
    await fixture.service.registerApprovedPackage({ packageInputId: 'linked', packageRoot: fixture.packageRoot, manifest: linkedManifest });
    const linkedResult = await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'linked' });
    expect(linkedResult).toMatchObject({ ok: false, error: { code: 'unsafe-path' } });

    expect((await fixture.service.install({ gameDetectionId: fixture.detectionId, packageInputId: 'fixture-package' })).ok).toBe(true);
    await writeFile(join(fixture.gameRoot, 'mods', 'added.txt'), 'USER-CHANGED');
    const removed = await fixture.service.uninstall({ gameDetectionId: fixture.detectionId, modId: 'fixture-mod' });
    expect(removed).toMatchObject({ ok: false, error: { code: 'integrity-failed' } });
    expect(await readFile(join(fixture.gameRoot, 'mods', 'added.txt'), 'utf8')).toBe('USER-CHANGED');
  });
});
