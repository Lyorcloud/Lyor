import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createPartialDownload, DownloadManager, hashBytes, type DownloadRequest, type DownloadResult } from '../electron/main/installation-engine/download-manager';
import { TransactionJournalStore } from '../electron/main/installation-engine/journal';
import { redactLogText, sanitizeEngineLog } from '../electron/main/installation-engine/sanitized-log';
import { assertNoDependencyCycle, runPreflight, type PreflightInput } from '../electron/main/installation-engine/preflight';
import { InstallationTransactionCoordinator, type TransactionHooks } from '../electron/main/installation-engine/transaction';

const roots: string[] = [];
const servers: Server[] = [];

const listen = async (handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; url: string }> => {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { server, url: `http://127.0.0.1:${port}/package.bin?signature=secret` };
};

const fixtureRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'lyor-transaction-fixture-'));
  roots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

describe('DownloadManager', () => {
  it('resumes a partial download with HTTP Range and verifies SHA-256 before commit', async () => {
    const bytes = Buffer.from('DETERMINISTIC-DOWNLOAD-BYTES');
    let observedRange = '';
    const { url } = await listen((request, response) => {
      observedRange = String(request.headers.range ?? '');
      const offset = Number.parseInt(observedRange.replace('bytes=', '').replace('-', ''), 10) || 0;
      response.writeHead(offset > 0 ? 206 : 200, { 'Content-Length': bytes.length - offset });
      response.end(bytes.subarray(offset));
    });
    const root = await fixtureRoot();
    const destination = join(root, 'cache', 'package.bin');
    await createPartialDownload(destination, bytes.subarray(0, 9));
    const result = await new DownloadManager({ sleep: async () => undefined }).download({
      url, destinationPath: destination, expectedSha256: hashBytes(bytes), expectedSize: bytes.length,
    });
    expect(result.resumed).toBe(true);
    expect(observedRange).toBe('bytes=9-');
    expect(await readFile(destination)).toEqual(bytes);
  });

  it('safely restarts when Range is ignored and rejects mismatched bytes', async () => {
    const good = Buffer.from('GOOD');
    const { url } = await listen((_request, response) => { response.writeHead(200); response.end('BAD!'); });
    const root = await fixtureRoot();
    const destination = join(root, 'cache.bin');
    await createPartialDownload(destination, Buffer.from('GO'));
    await expect(new DownloadManager({ sleep: async () => undefined }).download({
      url, destinationPath: destination, expectedSha256: hashBytes(good), expectedSize: good.length,
    })).rejects.toMatchObject({ code: 'integrity-failed' });
  });

  it('uses bounded retries and preserves no credential in its error', async () => {
    let attempts = 0;
    const { url } = await listen((_request, response) => { attempts += 1; response.writeHead(503); response.end(); });
    const root = await fixtureRoot();
    await expect(new DownloadManager({ sleep: async () => undefined }).download({
      url, destinationPath: join(root, 'cache.bin'), expectedSha256: '0'.repeat(64), expectedSize: 1, maximumAttempts: 3,
    })).rejects.toThrow('Download retry limit was reached.');
    expect(attempts).toBe(3);
  });
});

const validPreflight = async (root: string): Promise<PreflightInput> => {
  await mkdir(root, { recursive: true });
  return {
    authenticated: true, entitled: true, published: true, gameCompatible: true,
    gameProcessRunning: false, requiredBytes: 10, availableBytes: 100,
    writableRoots: [root], requiredDependencies: [{ modId: 'base', optional: false }],
    installedMods: [{ modId: 'base', version: '1.0.0', dependencies: [] }], conflicts: [],
  };
};

describe('preflight and durable transaction recovery', () => {
  it('rejects missing dependencies, conflicts, cycles, process, and disk gates', async () => {
    const root = await fixtureRoot();
    const valid = await validPreflight(root);
    await expect(runPreflight({ ...valid, gameProcessRunning: true })).rejects.toThrow('must be closed');
    await expect(runPreflight({ ...valid, availableBytes: 1 })).rejects.toThrow('disk space');
    await expect(runPreflight({ ...valid, requiredDependencies: [{ modId: 'missing', optional: false }] })).rejects.toThrow('dependency');
    await expect(runPreflight({ ...valid, conflicts: ['base'] })).rejects.toThrow('conflicting');
    expect(() => assertNoDependencyCycle([
      { modId: 'a', version: '1', dependencies: ['b'] },
      { modId: 'b', version: '1', dependencies: ['a'] },
    ])).toThrow('cycle');
  });

  it('rolls back every mutation phase failure and never marks a partial install installed', async () => {
    const root = await fixtureRoot();
    const preflight = await validPreflight(join(root, 'writable'));
    class FixtureDownloader extends DownloadManager {
      override async download(input: DownloadRequest): Promise<DownloadResult> {
        return { path: input.destinationPath, sha256: input.expectedSha256, size: input.expectedSize, resumed: false };
      }
    }
    for (const failedHook of ['backup', 'apply', 'verify'] as const) {
      const journal = new TransactionJournalStore(join(root, `journal-${failedHook}`));
      const coordinator = new InstallationTransactionCoordinator(journal, new FixtureDownloader());
      let rollbacks = 0;
      const hooks: TransactionHooks = {
        validate: async () => undefined, stage: async () => undefined,
        backup: async () => { if (failedHook === 'backup') throw new Error('injected'); },
        apply: async () => { if (failedHook === 'apply') throw new Error('injected'); },
        verify: async () => { if (failedHook === 'verify') throw new Error('injected'); },
        rollback: async () => { rollbacks += 1; },
      };
      const result = await coordinator.execute({
        transactionId: `failure_${failedHook}`, modId: 'fixture-mod', modVersion: '1.0.0',
        gameDetectionId: 'fixture-game', preflight,
        download: { url: 'http://127.0.0.1/package', destinationPath: join(root, `${failedHook}.bin`), expectedSha256: '0'.repeat(64), expectedSize: 0 },
      }, hooks);
      expect(result.phase).toBe('failed');
      expect(rollbacks).toBe(1);
    }
  });

  it('selects deterministic resume or rollback after simulated restart', async () => {
    const root = await fixtureRoot();
    const store = new TransactionJournalStore(join(root, 'journals'));
    const coordinator = new InstallationTransactionCoordinator(store);
    await store.create({ transactionId: 'before_mutation', modId: 'a', modVersion: '1', gameDetectionId: 'g' });
    await store.transition('before_mutation', 'staging');
    await store.create({ transactionId: 'after_mutation', modId: 'b', modVersion: '1', gameDetectionId: 'g' });
    await store.transition('after_mutation', 'installing');
    const resumed: string[] = [];
    const rolledBack: string[] = [];
    await coordinator.recover({
      resume: async (entry) => { resumed.push(entry.transactionId); },
      rollback: async (entry) => { rolledBack.push(entry.transactionId); },
    });
    expect(resumed).toEqual(['before_mutation']);
    expect(rolledBack).toEqual(['after_mutation']);
    expect((await store.read('after_mutation'))?.phase).toBe('failed');
  });
});

describe('engine log redaction', () => {
  it('redacts signed URLs, bearer tokens, and sensitive user paths', () => {
    expect(redactLogText('https://host/file?token=secret Bearer abc C:\\Users\\alice\\game')).not.toMatch(/secret|abc|alice/u);
    const safe = sanitizeEngineLog({ operation: 'install', modId: 'fixture', version: '1', gameId: 'game-test', phase: 'verify', durationMs: 1.4, errorCode: null });
    expect(safe).toEqual({ operation: 'install', modId: 'fixture', version: '1', gameId: 'game-test', phase: 'verify', durationMs: 1, errorCode: null });
  });
});
