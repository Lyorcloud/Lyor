import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import { app, safeStorage } from 'electron';
import {
  createClient,
  type AuthError as SupabaseAuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type {
  AuthError,
  AuthResult,
  AuthState,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  UpdatePasswordInput,
} from '../shared/auth';

const AUTH_CALLBACK_URL = 'lyor://auth/callback';
const SESSION_STORAGE_KEY = 'lyor.supabase.session';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const REQUEST_COOLDOWN_MS = 1_000;

const isClientSafeKey = (key: string): boolean => {
  if (key.startsWith('sb_secret_')) return false;
  const jwtPayload = key.split('.')[1];
  if (!jwtPayload) return key.startsWith('sb_publishable_');
  try {
    const payload = JSON.parse(Buffer.from(jwtPayload, 'base64url').toString('utf8')) as Record<string, unknown>;
    return payload.role !== 'service_role' && payload.role !== 'supabase_admin';
  } catch {
    return false;
  }
};

const anonymousState = (configured: boolean): AuthState => ({
  status: configured ? 'anonymous' : 'configurationRequired',
  user: null,
  expiresAt: null,
  passwordRecoveryPending: false,
});

interface AuthConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

export interface AuthServiceOptions {
  readonly emitState: (state: AuthState) => void;
  readonly sessionPath?: string;
  readonly now?: () => number;
}

class SecureSessionStorage {
  readonly #filePath: string;
  readonly #memory = new Map<string, string>();

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async getItem(key: string): Promise<string | null> {
    if (key !== SESSION_STORAGE_KEY) return null;

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return this.#memory.get(key) ?? null;
      }

      const encrypted = await fs.readFile(this.#filePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (key !== SESSION_STORAGE_KEY) return;

    if (!safeStorage.isEncryptionAvailable()) {
      this.#memory.set(key, value);
      return;
    }

    const encrypted = safeStorage.encryptString(value);
    const temporaryPath = `${this.#filePath}.tmp`;
    await fs.mkdir(dirname(this.#filePath), { recursive: true });
    await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await fs.rename(temporaryPath, this.#filePath);
  }

  async removeItem(key: string): Promise<void> {
    if (key !== SESSION_STORAGE_KEY) return;
    this.#memory.delete(key);
    await fs.rm(this.#filePath, { force: true }).catch(() => undefined);
    await fs.rm(`${this.#filePath}.tmp`, { force: true }).catch(() => undefined);
  }
}

const getConfiguration = (): AuthConfiguration | null => {
  const urlValue = process.env.LYOR_SUPABASE_URL?.trim();
  const keyValue = process.env.LYOR_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!urlValue || !keyValue || keyValue.length > 4096 || !isClientSafeKey(keyValue)) return null;

  try {
    const url = new URL(urlValue);
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) || url.username || url.password) {
      return null;
    }
    return { url: url.origin, publishableKey: keyValue };
  } catch {
    return null;
  }
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isValidEmail = (email: string): boolean =>
  email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);

const isValidPassword = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;

const publicStateFromSession = (
  session: Session | null,
  passwordRecoveryPending = false,
): AuthState => {
  const user = session?.user;
  if (!session || !user?.email) return anonymousState(true);

  return {
    status: 'authenticated',
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_confirmed_at),
      // Authorization is enforced by private database roles and RLS. This value
      // is presentation-only and deliberately does not trust user_metadata.
      role: 'user',
    },
    expiresAt: session.expires_at
      ? new Date(session.expires_at * 1_000).toISOString()
      : null,
    passwordRecoveryPending,
  };
};

const sanitizedError = (error: SupabaseAuthError): AuthError => {
  const status = error.status ?? 0;
  const code = error.code ?? '';
  const message = error.message.toLowerCase();

  if (status === 429 || message.includes('rate limit')) {
    return { code: 'rateLimited', message: 'Please wait before trying again.' };
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return { code: 'invalidCredentials', message: 'The email or password is incorrect.' };
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return { code: 'emailNotVerified', message: 'Verify your email before signing in.' };
  }
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return { code: 'emailAlreadyRegistered', message: 'This email cannot be registered.' };
  }
  if (code.includes('weak_password') || message.includes('password')) {
    return { code: 'passwordTooWeak', message: 'Choose a stronger password.' };
  }
  if (status === 0 || message.includes('fetch')) {
    return { code: 'networkUnavailable', message: 'The authentication service is unavailable.' };
  }
  if (code === 'refresh_token_not_found' || code === 'refresh_token_already_used') {
    return { code: 'sessionExpired', message: 'Your session expired. Sign in again.' };
  }
  return { code: 'requestFailed', message: 'The request could not be completed.' };
};

const invalidInput = (message: string): AuthError => ({
  code: 'invalidInput',
  message,
});

export class AuthService {
  readonly #client: SupabaseClient | null;
  readonly #configuration: AuthConfiguration | null;
  readonly #emitState: (state: AuthState) => void;
  readonly #lastRequestAt = new Map<string, number>();
  readonly #now: () => number;
  #state: AuthState;

  constructor(options: AuthServiceOptions) {
    this.#configuration = getConfiguration();
    this.#emitState = options.emitState;
    this.#now = options.now ?? Date.now;
    this.#state = anonymousState(Boolean(this.#configuration));

    if (!this.#configuration) {
      this.#client = null;
      return;
    }

    const storage = new SecureSessionStorage(
      options.sessionPath ?? join(app.getPath('userData'), 'auth', 'session.bin'),
    );
    this.#client = createClient(
      this.#configuration.url,
      this.#configuration.publishableKey,
      {
        auth: {
          storage,
          storageKey: SESSION_STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      },
    );

    this.#client.auth.onAuthStateChange((event, session) => {
      const recovery = event === 'PASSWORD_RECOVERY';
      this.#setState(publicStateFromSession(session, recovery));
    });
  }

  getState(): AuthState {
    return this.#state;
  }

  /** Main-process-only capability. Never expose this client through preload. */
  getCloudClient(): SupabaseClient | null {
    return this.#client;
  }

  async restoreSession(): Promise<AuthState> {
    if (!this.#client) return this.#state;
    const { data, error } = await this.#client.auth.getSession();
    if (error) {
      await this.#client.auth.signOut({ scope: 'local' });
      this.#setState(anonymousState(true));
      return this.#state;
    }
    this.#setState(publicStateFromSession(data.session));
    return this.#state;
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const validation = this.#validateCredentials(email, input.password, input.passwordConfirm);
    if (validation) return this.#result(validation);
    if (this.#isRateLimited(`register:${email}`)) return this.#result({ code: 'rateLimited', message: 'Please wait before trying again.' });
    if (!this.#client) return this.#unavailable();

    const { data, error } = await this.#client.auth.signUp({
      email,
      password: input.password,
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    if (error) return this.#result(sanitizedError(error));
    this.#setState(publicStateFromSession(data.session));
    return { state: this.#state, error: null, notice: 'verificationSent' };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email) || !input.password || input.password.length > MAX_PASSWORD_LENGTH) {
      return this.#result(invalidInput('Enter a valid email and password.'));
    }
    if (this.#isRateLimited(`login:${email}`)) return this.#result({ code: 'rateLimited', message: 'Please wait before trying again.' });
    if (!this.#client) return this.#unavailable();

    const { data, error } = await this.#client.auth.signInWithPassword({ email, password: input.password });
    if (error) return this.#result(sanitizedError(error));
    this.#setState(publicStateFromSession(data.session));
    return this.#result(null);
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) return this.#result(invalidInput('Enter a valid email.'));
    if (this.#isRateLimited(`reset:${email}`)) return this.#result({ code: 'rateLimited', message: 'Please wait before trying again.' });
    if (!this.#client) return this.#unavailable();

    const { error } = await this.#client.auth.resetPasswordForEmail(email, { redirectTo: AUTH_CALLBACK_URL });
    if (error) return this.#result(sanitizedError(error));
    // Deliberately do not disclose whether an account exists.
    return { state: this.#state, error: null, notice: 'resetSent' };
  }

  async updatePassword(input: UpdatePasswordInput): Promise<AuthResult> {
    if (!isValidPassword(input.password) || input.password !== input.passwordConfirm) {
      return this.#result(invalidInput('Passwords must match and contain at least 8 characters.'));
    }
    if (!this.#client || this.#state.status !== 'authenticated' || !this.#state.passwordRecoveryPending) {
      return this.#result({ code: 'sessionExpired', message: 'Open a valid password reset link first.' });
    }
    const { error } = await this.#client.auth.updateUser({ password: input.password });
    if (error) return this.#result(sanitizedError(error));
    const { data } = await this.#client.auth.getSession();
    this.#setState(publicStateFromSession(data.session, false));
    return { state: this.#state, error: null, notice: 'passwordUpdated' };
  }

  async refreshSession(): Promise<AuthResult> {
    if (!this.#client) return this.#unavailable();
    const { data, error } = await this.#client.auth.refreshSession();
    if (error) {
      await this.#client.auth.signOut({ scope: 'local' });
      this.#setState(anonymousState(true));
      return this.#result(sanitizedError(error));
    }
    this.#setState(publicStateFromSession(data.session));
    return this.#result(null);
  }

  async logout(): Promise<AuthResult> {
    if (!this.#client) return this.#unavailable();
    const { error } = await this.#client.auth.signOut({ scope: 'local' });
    this.#setState(anonymousState(true));
    return this.#result(error ? sanitizedError(error) : null);
  }

  async handleDeepLink(candidate: string): Promise<boolean> {
    if (!this.#client) return false;

    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      return false;
    }
    if (url.protocol !== 'lyor:' || url.hostname !== 'auth' || url.pathname !== '/callback' || url.username || url.password) {
      return false;
    }

    const allowedParameters = new Set(['code', 'token_hash', 'type']);
    if ([...url.searchParams.keys()].some((key) => !allowedParameters.has(key))) return false;
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');

    if (code && !tokenHash && !type) {
      const { error } = await this.#client.auth.exchangeCodeForSession(code);
      return !error;
    }
    if (!code && tokenHash && (type === 'signup' || type === 'recovery' || type === 'email_change')) {
      const { error } = await this.#client.auth.verifyOtp({ token_hash: tokenHash, type });
      return !error;
    }
    return false;
  }

  #validateCredentials(email: string, password: string, confirmation: string): AuthError | null {
    if (!isValidEmail(email)) return invalidInput('Enter a valid email.');
    if (!isValidPassword(password)) return invalidInput('Password must contain 8 to 128 characters.');
    if (password !== confirmation) return invalidInput('Passwords do not match.');
    return null;
  }

  #isRateLimited(key: string): boolean {
    const now = this.#now();
    const previous = this.#lastRequestAt.get(key) ?? 0;
    this.#lastRequestAt.set(key, now);
    return previous > 0 && now - previous < REQUEST_COOLDOWN_MS;
  }

  #setState(state: AuthState): void {
    this.#state = state;
    this.#emitState(state);
  }

  #result(error: AuthError | null): AuthResult {
    return { state: this.#state, error, notice: null };
  }

  #unavailable(): AuthResult {
    return this.#result({
      code: 'configurationUnavailable',
      message: 'Authentication is not configured in this build.',
    });
  }
}

export const getAuthDeepLinkFromArguments = (argumentsList: readonly string[]): string | null =>
  argumentsList.find((argument) => argument.startsWith('lyor://auth/callback')) ?? null;
