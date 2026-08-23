export const AUTH_CHANNELS = {
  getState: 'auth:get-state',
  register: 'auth:register',
  login: 'auth:login',
  forgotPassword: 'auth:forgot-password',
  updatePassword: 'auth:update-password',
  refreshSession: 'auth:refresh-session',
  setRememberMe: 'auth:set-remember-me',
  logout: 'auth:logout',
  stateChanged: 'auth:state-changed',
} as const;

export type AuthInvokeChannel =
  (typeof AUTH_CHANNELS)[keyof Omit<typeof AUTH_CHANNELS, 'stateChanged'>];

export type AppRole = 'user' | 'admin' | 'super_admin';
export type AuthStatus = 'loading' | 'configurationRequired' | 'anonymous' | 'authenticated';

export interface PublicAuthUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly role: AppRole;
}

export interface AuthState {
  readonly status: AuthStatus;
  readonly user: PublicAuthUser | null;
  readonly expiresAt: string | null;
  readonly passwordRecoveryPending: boolean;
  readonly rememberMe: boolean;
}

export type AuthErrorCode =
  | 'configurationUnavailable'
  | 'invalidInput'
  | 'invalidCredentials'
  | 'emailNotVerified'
  | 'emailAlreadyRegistered'
  | 'passwordTooWeak'
  | 'rateLimited'
  | 'sessionExpired'
  | 'networkUnavailable'
  | 'requestFailed';

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
}

export interface AuthResult {
  readonly state: AuthState;
  readonly error: AuthError | null;
  readonly notice: 'verificationSent' | 'resetSent' | 'passwordUpdated' | null;
}

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly passwordConfirm: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface ForgotPasswordInput {
  readonly email: string;
}

export interface UpdatePasswordInput {
  readonly password: string;
  readonly passwordConfirm: string;
}

export interface LyorAuthApi {
  readonly getState: () => Promise<AuthState>;
  readonly register: (input: RegisterInput) => Promise<AuthResult>;
  readonly login: (input: LoginInput) => Promise<AuthResult>;
  readonly forgotPassword: (input: ForgotPasswordInput) => Promise<AuthResult>;
  readonly updatePassword: (input: UpdatePasswordInput) => Promise<AuthResult>;
  readonly refreshSession: () => Promise<AuthResult>;
  readonly setRememberMe: (enabled: boolean) => Promise<AuthResult>;
  readonly logout: () => Promise<AuthResult>;
  readonly onStateChange: (listener: (state: AuthState) => void) => () => void;
}
