import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { parseAdvancedManifest } from '../electron/main/installation-engine/advanced-manifest';
import { SyntheticContainerHandler, createSyntheticContainer } from '../electron/main/installation-engine/synthetic-container';
import { SyntheticGameAdapter } from '../electron/main/installation-engine/synthetic-game-adapter';

const roots: string[] = [];
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'lyor-advanced-fixture-'));
  roots.push(root);
  const game = join(root, 'game');
  const packageRoot = join(root, 'package');
  const backup = join(root, 'backup');
  await Promise.all([mkdir(game), mkdir(packageRoot), mkdir(backup)]);
  const archive = join(game, 'content.lyor-container');
  await createSyntheticContainer(archive, { 'original/a.txt': 'ORIGINAL-A', 'replace.txt': 'ORIGINAL-R' });
  await writeFile(join(game, 'settings.json'), '{"keep":true}\n');
  await writeFile(join(packageRoot, 'add.txt'), 'ADD-CONTENT');
  await writeFile(join(packageRoot, 'replace.txt'), 'REPLACE-CONTENT');
  await writeFile(join(packageRoot, 'patch.json'), '{"newValue":42}\n');
  const manifest = parseAdvancedManifest({
    schemaVersion: 2,
    mod: { id: 'synthetic-mod', version: '1.0.0' },
    game: { id: 'game-synthetic-fixture', edition: 'standard', versionRange: '>=1.0.0,<2.0.0' },
    adapter: 'synthetic-container-fixture',
    requiredCapabilities: ['archive-operations', 'config-merge', 'validation'],
    sources: [
      { id: 'add', path: 'add.txt', sha256: sha('ADD-CONTENT') },
      { id: 'replace', path: 'replace.txt', sha256: sha('REPLACE-CONTENT') },
      { id: 'config', path: 'patch.json', sha256: sha('{"newValue":42}\n') },
    ],
    operations: [
      { type: 'ARCHIVE_ADD', target: 'content.lyor-container', entry: 'mods/added.txt', source: 'add' },
      { type: 'ARCHIVE_REPLACE', target: 'content.lyor-container', entry: 'replace.txt', source: 'replace' },
      { type: 'ARCHIVE_DELETE', target: 'content.lyor-container', entry: 'original/a.txt' },
      { type: 'CONFIG_MERGE', target: 'settings.json', source: 'config', format: 'json' },
    ], dependencies: [], conflicts: [], installedSize: 42,
  });
  return { game, packageRoot, backup, archive, manifest };
};

afterEach(async () => Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true }))));

describe('synthetic advanced adapter', () => {
  it('installs, verifies, and uninstalls to byte-for-byte original state', async () => {
    const item = await fixture();
    const beforeArchive = await readFile(item.archive);
    const beforeConfig = await readFile(join(item.game, 'settings.json'));
    const adapter = new SyntheticGameAdapter();
    expect(adapter.supports('game-synthetic-fixture', 'standard', '1.4.0')).toBe(true);
    const records = await adapter.apply(item.game, item.packageRoot, item.backup, item.manifest);
    const handler = new SyntheticContainerHandler();
    await handler.open(item.archive);
    expect(Buffer.from(handler.read('mods/added.txt')).toString()).toBe('ADD-CONTENT');
    expect(Buffer.from(handler.read('replace.txt')).toString()).toBe('REPLACE-CONTENT');
    expect(handler.inspect().some((entry) => entry.path === 'original/a.txt')).toBe(false);
    expect(JSON.parse(await readFile(join(item.game, 'settings.json'), 'utf8'))).toEqual({ keep: true, newValue: 42 });
    await adapter.uninstall(records);
    expect(await readFile(item.archive)).toEqual(beforeArchive);
    expect(await readFile(join(item.game, 'settings.json'))).toEqual(beforeConfig);
  });

  it('rejects malicious/case-colliding/corrupt entries and unsupported capabilities', async () => {
    const item = await fixture();
    await expect(createSyntheticContainer(join(item.game, 'bad.lyor-container'), { '../escape': 'x' })).rejects.toMatchObject({ code: 'unsafe-path' });
    await writeFile(join(item.game, 'collision.lyor-container'), JSON.stringify({ format: 'lyor-synthetic-container-v1', entries: [
      { path: 'A.txt', data: Buffer.from('a').toString('base64'), sha256: sha('a') },
      { path: 'a.txt', data: Buffer.from('b').toString('base64'), sha256: sha('b') },
    ] }));
    await expect(new SyntheticContainerHandler().open(join(item.game, 'collision.lyor-container'))).rejects.toMatchObject({ code: 'integrity-failed' });
    const adapter = new SyntheticGameAdapter();
    expect(() => adapter.validate({ ...item.manifest, requiredCapabilities: ['mod-layer'] })).toThrow('unsupported');
  });

  it('rolls back earlier container changes when a later config merge conflicts', async () => {
    const item = await fixture();
    const before = await readFile(item.archive);
    await writeFile(join(item.packageRoot, 'conflict.json'), '{"keep":false}\n');
    const manifest = { ...item.manifest,
      sources: [...item.manifest.sources, { id: 'conflict', path: 'conflict.json', sha256: sha('{"keep":false}\n') }],
      operations: [item.manifest.operations[0], { type: 'CONFIG_MERGE' as const, target: 'settings.json', source: 'conflict', format: 'json' as const }],
    };
    await expect(new SyntheticGameAdapter().apply(item.game, item.packageRoot, item.backup, manifest)).rejects.toMatchObject({ code: 'ownership-conflict' });
    expect(await readFile(item.archive)).toEqual(before);
  });
});
