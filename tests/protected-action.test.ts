import { describe, expect, it, vi } from 'vitest';

import { ProtectedActionCoordinator } from '../src/services/protectedActionService';

describe('protected action continuation', () => {
  it('runs immediately for an authenticated user', () => {
    const coordinator = new ProtectedActionCoordinator();
    const action = vi.fn(); const open = vi.fn();
    coordinator.requireAuthentication(true, action, open);
    expect(action).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens sign in and resumes the pending action exactly once after success', () => {
    const coordinator = new ProtectedActionCoordinator();
    const action = vi.fn(); const open = vi.fn();
    coordinator.requireAuthentication(false, action, open);
    expect(open).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    coordinator.authenticationSucceeded();
    coordinator.authenticationSucceeded();
    expect(action).toHaveBeenCalledOnce();
  });

  it('discards the pending action when sign in is cancelled', () => {
    const coordinator = new ProtectedActionCoordinator();
    const action = vi.fn();
    coordinator.requireAuthentication(false, action, vi.fn());
    coordinator.cancel();
    coordinator.authenticationSucceeded();
    expect(action).not.toHaveBeenCalled();
  });
});
