import { promises as fs } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { app, safeStorage } from 'electron';
import {
  createClient,
  type AuthError as SupabaseAuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

import type {
  AppRole,
  AuthError,
  AuthResult,
  AuthState,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  UpdatePasswordInput,
} from '../shared/auth';

const AUTH_CALLBACK_URL = 'lyor://auth/callback';
const DEFAULT_SESSION_STORAGE_KEY = 'lyor.supabase.session';
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

const anonymousState = (configured: boolean, rememberMe = true): AuthState => ({
  status: configured ? 'anonymous' : 'configurationRequired',
  user: null,
  expiresAt: null,
  passwordRecoveryPending: false,
  rememberMe,
});

interface AuthConfiguration {
  readonly url: string;
  readonly publishableKey: string;
}

const getPackagedConfiguration = (): Partial<AuthConfiguration> => {
  if (!app.isPackaged) return {};
  try {
    const parsed = JSON.parse(readFileSync(join(process.resourcesPath, 'runtime-config.json'), 'utf8')) as Record<string, unknown>;
    return {
      url: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
      publishableKey: typeof parsed.supabasePublishableKey === 'string' ? parsed.supabasePublishableKey.trim() : undefined,
    };
  } catch {
    return {};
  }
};

export interface AuthServiceOptions {
  readonly emitState: (state: AuthState) => void;
  readonly sessionPath?: string;
  readonly sessionStorageKey?: string;
  readonly rememberPreferencePath?: string;
  readonly now?: () => number;
}

export class SecureSessionStorage {
  readonly #filePath: string;
  readonly #storageKey: string;
  readonly #memory = new Map<string, string>();
  #persistent: boolean;

  constructor(filePath: string, storageKey: string, persistent: boolean) {
    this.#filePath = filePath;
    this.#storageKey = storageKey;
    this.#persistent = persistent;
  }

  async getItem(key: string): Promise<string | null> {
    if (key !== this.#storageKey) return null;

    try {
      if (!this.#persistent || !safeStorage.isEncryptionAvailable()) {
        return this.#memory.get(key) ?? null;
      }

      const encrypted = await fs.readFile(this.#filePath);
      const value = safeStorage.decryptString(encrypted);
      this.#memory.set(key, value);
      return value;
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (key !== this.#storageKey) return;

    this.#memory.set(key, value);
    if (!this.#persistent || !safeStorage.isEncryptionAvailable()) {
      return;
    }

    const encrypted = safeStorage.encryptString(value);
    const temporaryPath = `${this.#filePath}.tmp`;
    await fs.mkdir(dirname(this.#filePath), { recursive: true });
    await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await fs.rename(temporaryPath, this.#filePath);
  }

  async removeItem(key: string): Promise<void> {
    if (key !== this.#storageKey) return;
    this.#memory.delete(key);
    await fs.rm(this.#filePath, { force: true }).catch(() => undefined);
    await fs.rm(`${this.#filePath}.tmp`, { force: true }).catch(() => undefined);
  }

  async setPersistent(persistent: boolean): Promise<void> {
    this.#persistent = persistent;
    if (!persistent) {
      await fs.rm(this.#filePath, { force: true }).catch(() => undefined);
      await fs.rm(`${this.#filePath}.tmp`, { force: true }).catch(() => undefined);
      return;
    }
    const value = this.#memory.get(this.#storageKey);
    if (value) await this.setItem(this.#storageKey, value);
  }
}

const getConfiguration = (): AuthConfiguration | null => {
  const packaged = getPackagedConfiguration();
  const urlValue = process.env.LYOR_SUPABASE_URL?.trim() || packaged.url;
  const keyValue = process.env.LYOR_SUPABASE_PUBLISHABLE_KEY?.trim() || packaged.publishableKey;

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
  role: AppRole = 'user',
  rememberMe = true,
): AuthState => {
  const user = session?.user;
  if (!session || !user?.email) return { ...anonymousState(true), rememberMe };

  return {
    status: 'authenticated',
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_confirmed_at),
      // Resolved through a SECURITY DEFINER RPC backed by app_private roles.
      // User-editable metadata is deliberately ignored.
      role,
    },
    expiresAt: session.expires_at
      ? new Date(session.expires_at * 1_000).toISOString()
      : null,
    passwordRecoveryPending,
    rememberMe,
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
  readonly #storage: SecureSessionStorage | null;
  readonly #rememberPreferencePath: string;
  #rememberMe: boolean;
  #state: AuthState;

  constructor(options: AuthServiceOptions) {
    this.#configuration = getConfiguration();
    this.#emitState = options.emitState;
    this.#now = options.now ?? Date.now;
    const sessionPath = options.sessionPath ?? join(app.getPath('userData'), 'auth', 'session.bin');
    this.#rememberPreferencePath = options.rememberPreferencePath ?? `${sessionPath}.remember.json`;
    this.#rememberMe = this.#readRememberPreference();
    this.#state = { ...anonymousState(Boolean(this.#configuration)), rememberMe: this.#rememberMe };

    if (!this.#configuration) {
      this.#client = null;
      this.#storage = null;
      return;
    }

    const sessionStorageKey = options.sessionStorageKey ?? DEFAULT_SESSION_STORAGE_KEY;
    const storage = new SecureSessionStorage(sessionPath, sessionStorageKey, this.#rememberMe);
    this.#storage = storage;
    this.#client = createClient(
      this.#configuration.url,
      this.#configuration.publishableKey,
      {
        auth: {
          storage,
          storageKey: sessionStorageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      },
    );

    this.#client.auth.onAuthStateChange((event, session) => {
      const recovery = event === 'PASSWORD_RECOVERY';
      void this.#hydrateSession(session, recovery);
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
    if (!this.#rememberMe) await this.#storage?.setPersistent(false);
    const { data, error } = await this.#client.auth.getSession();
    if (error) {
      await this.#client.auth.signOut({ scope: 'local' });
      this.#setState(anonymousState(true, this.#rememberMe));
      return this.#state;
    }
    await this.#hydrateSession(data.session);
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
    await this.#hydrateSession(data.session);
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
    await this.#hydrateSession(data.session);
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
    await this.#hydrateSession(data.session, false);
    return { state: this.#state, error: null, notice: 'passwordUpdated' };
  }

  async refreshSession(): Promise<AuthResult> {
    if (!this.#client) return this.#unavailable();
    const { data, error } = await this.#client.auth.refreshSession();
    if (error) {
      await this.#client.auth.signOut({ scope: 'local' });
      this.#setState(anonymousState(true, this.#rememberMe));
      return this.#result(sanitizedError(error));
    }
    await this.#hydrateSession(data.session);
    return this.#result(null);
  }

  async logout(): Promise<AuthResult> {
    if (!this.#client) return this.#unavailable();
    const { error } = await this.#client.auth.signOut({ scope: 'local' });
    this.#setState(anonymousState(true, this.#rememberMe));
    return this.#result(error ? sanitizedError(error) : null);
  }

  async setRememberMe(enabled: boolean): Promise<AuthResult> {
    this.#rememberMe = enabled;
    await this.#storage?.setPersistent(enabled);
    await this.#writeRememberPreference();
    this.#setState({ ...this.#state, rememberMe: enabled });
    return this.#result(null);
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

  async #hydrateSession(session: Session | null, passwordRecoveryPending = false): Promise<void> {
    if (!session || !this.#client) {
      this.#setState(publicStateFromSession(session, passwordRecoveryPending, 'user', this.#rememberMe));
      return;
    }
    let role: AppRole = 'user';
    try {
      const { data, error } = await this.#client.rpc('planaria_my_access');
      const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
      if (!error && row && (row.role === 'admin' || row.role === 'super_admin')) role = row.role;
    } catch {
      // Fail closed to the normal user role when the authorization lookup is
      // unavailable. Backend endpoints still independently authorize.
    }
    this.#setState(publicStateFromSession(session, passwordRecoveryPending, role, this.#rememberMe));
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

  #readRememberPreference(): boolean {
    try {
      const parsed = JSON.parse(readFileSync(this.#rememberPreferencePath, 'utf8')) as Record<string, unknown>;
      return parsed.rememberMe !== false;
    } catch { return true; }
  }

  async #writeRememberPreference(): Promise<void> {
    await fs.mkdir(dirname(this.#rememberPreferencePath), { recursive: true });
    const temporary = `${this.#rememberPreferencePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ rememberMe: this.#rememberMe }), { mode: 0o600 });
    await fs.rename(temporary, this.#rememberPreferencePath);
  }
}

export const getAuthDeepLinkFromArguments = (argumentsList: readonly string[]): string | null =>
  argumentsList.find((argument) => argument.startsWith('lyor://auth/callback')) ?? null;
