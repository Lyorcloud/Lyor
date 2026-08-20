import { useCallback, useEffect, useState } from 'react';

import type {
  AuthResult,
  AuthState,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  UpdatePasswordInput,
} from '../../electron/shared/auth';

const unavailableState: AuthState = {
  status: 'configurationRequired',
  user: null,
  expiresAt: null,
  passwordRecoveryPending: false,
};

const unavailableResult: AuthResult = {
  state: unavailableState,
  error: {
    code: 'configurationUnavailable',
    message: 'Authentication is not configured in this build.',
  },
  notice: null,
};

const getBridge = () =>
  (window as Window & { lyorAuth?: Window['lyorAuth'] }).lyorAuth;

export function useAuth() {
  const [state, setState] = useState<AuthState>(unavailableState);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let active = true;
    void bridge.getState().then((next) => {
      if (active) setState(next);
    }).catch(() => undefined);
    const unsubscribe = bridge.onStateChange((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const run = useCallback(async (operation: () => Promise<AuthResult>): Promise<AuthResult> => {
    setPending(true);
    try {
      const result = await operation();
      setState(result.state);
      return result;
    } catch {
      return unavailableResult;
    } finally {
      setPending(false);
    }
  }, []);

  return {
    state,
    pending,
    register: (input: RegisterInput) => run(() => getBridge()?.register(input) ?? Promise.resolve(unavailableResult)),
    login: (input: LoginInput) => run(() => getBridge()?.login(input) ?? Promise.resolve(unavailableResult)),
    forgotPassword: (input: ForgotPasswordInput) => run(() => getBridge()?.forgotPassword(input) ?? Promise.resolve(unavailableResult)),
    updatePassword: (input: UpdatePasswordInput) => run(() => getBridge()?.updatePassword(input) ?? Promise.resolve(unavailableResult)),
    refreshSession: () => run(() => getBridge()?.refreshSession() ?? Promise.resolve(unavailableResult)),
    logout: () => run(() => getBridge()?.logout() ?? Promise.resolve(unavailableResult)),
  };
}
