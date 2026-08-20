import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const runIntegration = process.env.LYOR_RUN_SUPABASE_INTEGRATION === '1';
const integration = runIntegration ? describe : describe.skip;

class MemoryStorage implements SupportedStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const waitForCallback = async (email: string): Promise<URL> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = await response.json() as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`).then((value) => value.json()) as { HTML?: string; Text?: string };
      const content = `${message.HTML ?? ''} ${message.Text ?? ''}`.replaceAll('&amp;', '&');
      const verificationUrl = content.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]*/u)?.[0];
      if (verificationUrl) {
        const verification = await fetch(verificationUrl, { redirect: 'manual' });
        const location = verification.headers.get('location');
        if (location?.startsWith('lyor://auth/callback')) return new URL(location);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local Mailpit did not produce a usable auth callback.');
};

integration('local Supabase Auth lifecycle', () => {
  it('registers, verifies, rejects a wrong password, restores, refreshes, resets, and logs out', async () => {
    const url = process.env.LYOR_SUPABASE_URL as string;
    const key = process.env.LYOR_SUPABASE_PUBLISHABLE_KEY as string;
    const storage = new MemoryStorage();
    const client = createClient(url, key, { auth: { storage, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' } });
    const email = `auth-${Date.now()}@lyor.test`;
    const originalPassword = 'OriginalPass1';
    const newPassword = 'ChangedPass2';

    const registration = await client.auth.signUp({ email, password: originalPassword, options: { emailRedirectTo: 'lyor://auth/callback' } });
    expect(registration.error).toBeNull();
    expect(registration.data.session).toBeNull();

    const verificationCallback = await waitForCallback(email);
    const verificationCode = verificationCallback.searchParams.get('code');
    expect(verificationCode).toBeTruthy();
    expect((await client.auth.exchangeCodeForSession(verificationCode as string)).error).toBeNull();
    await client.auth.signOut();

    expect((await client.auth.signInWithPassword({ email, password: 'WrongPass9' })).error).not.toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: originalPassword })).error).toBeNull();

    const restored = createClient(url, key, { auth: { storage, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' } });
    expect((await restored.auth.getSession()).data.session?.user.email).toBe(email);
    expect((await restored.auth.refreshSession()).error).toBeNull();
    await restored.auth.signOut();

    expect((await client.auth.resetPasswordForEmail(email, { redirectTo: 'lyor://auth/callback' })).error).toBeNull();
    const recoveryCallback = await waitForCallback(email);
    const recoveryCode = recoveryCallback.searchParams.get('code');
    expect(recoveryCode).toBeTruthy();
    expect((await client.auth.exchangeCodeForSession(recoveryCode as string)).error).toBeNull();
    expect((await client.auth.updateUser({ password: newPassword })).error).toBeNull();
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: newPassword })).error).toBeNull();
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  }, 30_000);
});
