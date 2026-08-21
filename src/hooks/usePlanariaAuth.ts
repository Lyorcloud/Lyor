import { useCallback, useEffect, useState } from 'react';

import type { AuthResult, AuthState, LoginInput } from '../../electron/shared/auth';

const unavailableState: AuthState = {
  status: 'configurationRequired', user: null, expiresAt: null, passwordRecoveryPending: false,
};

export function usePlanariaAuth() {
  const [state, setState] = useState<AuthState>(unavailableState);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void window.planariaAuth.getState().then((next) => { if (active) setState(next); }).catch(() => undefined);
    const unsubscribe = window.planariaAuth.onStateChange((next) => { if (active) setState(next); });
    return () => { active = false; unsubscribe(); };
  }, []);

  const run = useCallback(async (operation: () => Promise<AuthResult>) => {
    setPending(true);
    try {
      const result = await operation();
      setState(result.state);
      return result;
    } finally {
      setPending(false);
    }
  }, []);

  return {
    state,
    pending,
    login: (input: LoginInput) => run(() => window.planariaAuth.login(input)),
    logout: () => run(() => window.planariaAuth.logout()),
  };
}
