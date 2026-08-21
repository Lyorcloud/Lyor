import type { AuthResult, AuthState, LoginInput } from './auth';

export const PLANARIA_AUTH_CHANNELS = {
  getState: 'planaria-auth:get-state',
  login: 'planaria-auth:login',
  logout: 'planaria-auth:logout',
  stateChanged: 'planaria-auth:state-changed',
} as const;

export type PlanariaAuthInvokeChannel =
  (typeof PLANARIA_AUTH_CHANNELS)[keyof Omit<typeof PLANARIA_AUTH_CHANNELS, 'stateChanged'>];

export interface PlanariaAuthApi {
  readonly getState: () => Promise<AuthState>;
  readonly login: (input: LoginInput) => Promise<AuthResult>;
  readonly logout: () => Promise<AuthResult>;
  readonly onStateChange: (listener: (state: AuthState) => void) => () => void;
}
