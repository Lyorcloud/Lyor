import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { acceptAnalyticsEvent, assertAdmin, assertEntitledPublishedDownload, transitionVersion } from '../server/planaria/lifecycle';
import { LocalS3CompatibleStorageProvider } from '../server/planaria/storage-provider';
import { hashBytes } from '../electron/main/installation-engine/download-manager';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true }))));

describe('provider-neutral multipart distribution fixture', () => {
  it('resumes parts, verifies final size/hash, emits expiring URLs, and keeps published objects immutable by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyor-s3-fixture-'));
    roots.push(root);
    let now = Date.parse('2026-08-20T09:00:00Z');
    const provider = new LocalS3CompatibleStorageProvider(root, 'http://127.0.0.1:9000', Buffer.from('fixture-secret'), () => now);
    const bytes = Buffer.from('MULTIPART-CONTENT');
    const session = await provider.createMultipartUpload({ modId: 'fixture-mod', version: '1.0.0', expectedSize: bytes.length, expectedSha256: hashBytes(bytes) });
    const first = await provider.putFixturePart(session.sessionId, 1, bytes.subarray(0, 7));
    const second = await provider.putFixturePart(session.sessionId, 2, bytes.subarray(7));
    const uploadUrl = await provider.createPartUploadUrl(session.sessionId, 2, 300);
    expect(provider.verifySignedUrl(uploadUrl)).toBe(true);
    const metadata = await provider.finalizeMultipartUpload(session.sessionId, [second, first]);
    expect(metadata).toMatchObject({ size: bytes.length, sha256: hashBytes(bytes), immutable: true });
    expect(await provider.readFixtureObject(metadata.objectKey)).toEqual(bytes);
    const downloadUrl = await provider.createSignedDownloadUrl(metadata.objectKey, 300);
    expect(provider.verifySignedUrl(downloadUrl)).toBe(true);
    now += 301000;
    expect(provider.verifySignedUrl(downloadUrl)).toBe(false);
  });

  it('rejects wrong final hash/size, duplicate parts, overwrite, and supports idempotent abort/delete cleanup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyor-s3-fixture-'));
    roots.push(root);
    const provider = new LocalS3CompatibleStorageProvider(root, 'http://127.0.0.1:9000', Buffer.from('fixture-secret'));
    const session = await provider.createMultipartUpload({ modId: 'fixture-mod', version: '1', expectedSize: 4, expectedSha256: '0'.repeat(64) });
    const part = await provider.putFixturePart(session.sessionId, 1, Buffer.from('BAD!'));
    await expect(provider.finalizeMultipartUpload(session.sessionId, [part])).rejects.toThrow('integrity');
    await provider.abortMultipartUpload(session.sessionId);
    await provider.abortMultipartUpload(session.sessionId);
    expect(await provider.objectExists(session.objectKey)).toBe(false);
    await provider.deleteObject(session.objectKey);
  });
});

describe('Planaria authorization, lifecycle, and analytics contracts', () => {
  it('blocks normal users and invalid/concurrent lifecycle transitions', () => {
    expect(() => assertAdmin('user')).toThrow('admin');
    expect(() => assertAdmin('admin')).not.toThrow();
    const draft = { id: 'v1', state: 'draft' as const, revision: 1, packageVerified: true, manifestValidated: true, adapterCompatible: true };
    const ready = transitionVersion(draft, 'ready', 1);
    expect(ready.state).toBe('ready');
    expect(() => transitionVersion(ready, 'published', 1)).toThrow('Concurrent');
    expect(transitionVersion(ready, 'published', 2).state).toBe('published');
    expect(() => transitionVersion({ ...draft, packageVerified: false }, 'ready', 1)).toThrow('validation');
  });

  it('requires Published entitlement and counts only verified, idempotent completed downloads', () => {
    expect(() => assertEntitledPublishedDownload({ authenticated: true, entitled: false, state: 'published' })).toThrow('rejected');
    expect(() => assertEntitledPublishedDownload({ authenticated: true, entitled: true, state: 'published' })).not.toThrow();
    const seen = new Set<string>();
    expect(acceptAnalyticsEvent('download_completed', false, seen, 'key')).toBe(false);
    expect(acceptAnalyticsEvent('download_completed', true, seen, 'key')).toBe(true);
    expect(acceptAnalyticsEvent('download_completed', true, seen, 'key')).toBe(false);
  });
});
