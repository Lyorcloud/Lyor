import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(Buffer.from(value).toString('base64')),
    decryptString: (value: Buffer) => Buffer.from(value.toString(), 'base64').toString('utf8'),
  },
}));

import { SecureSessionStorage } from '../electron/main/auth-service';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('Remember Me secure session storage', () => {
  it('persists an encrypted session when Remember Me is on', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyor-remember-')); roots.push(root);
    const path = join(root, 'session.bin');
    const storage = new SecureSessionStorage(path, 'session-key', true);
    await storage.setItem('session-key', 'token-json');
    expect((await readFile(path)).toString('utf8')).not.toContain('token-json');
    expect(await new SecureSessionStorage(path, 'session-key', true).getItem('session-key')).toBe('token-json');
  });

  it('keeps the running session in memory but removes persistence when turned off', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyor-session-only-')); roots.push(root);
    const path = join(root, 'session.bin');
    const storage = new SecureSessionStorage(path, 'session-key', true);
    await storage.setItem('session-key', 'token-json');
    await storage.setPersistent(false);
    expect(await storage.getItem('session-key')).toBe('token-json');
    expect(await new SecureSessionStorage(path, 'session-key', false).getItem('session-key')).toBeNull();
  });

  it('can persist the current in-memory session again and explicit removal wins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lyor-remember-again-')); roots.push(root);
    const path = join(root, 'session.bin');
    const storage = new SecureSessionStorage(path, 'session-key', false);
    await storage.setItem('session-key', 'token-json');
    await storage.setPersistent(true);
    expect(await new SecureSessionStorage(path, 'session-key', true).getItem('session-key')).toBe('token-json');
    await storage.removeItem('session-key');
    expect(await new SecureSessionStorage(path, 'session-key', true).getItem('session-key')).toBeNull();
  });
});
