import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthPanel } from '../src/components/AuthPanel';
import type { AuthResult, AuthState } from '../electron/shared/auth';

vi.mock('../src/i18n/I18nContext', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const anonymous: AuthState = { status: 'anonymous', user: null, expiresAt: null, passwordRecoveryPending: false, rememberMe: true };
const result: AuthResult = { state: anonymous, error: null, notice: null };

const renderPanel = (state = anonymous, overrides: Partial<React.ComponentProps<typeof AuthPanel>> = {}) => {
  const props: React.ComponentProps<typeof AuthPanel> = {
    forgotPassword: vi.fn().mockResolvedValue(result),
    login: vi.fn().mockResolvedValue(result),
    logout: vi.fn().mockResolvedValue(result),
    setRememberMe: vi.fn().mockResolvedValue(result),
    onClose: vi.fn(),
    open: true,
    pending: false,
    register: vi.fn().mockResolvedValue(result),
    state,
    updatePassword: vi.fn().mockResolvedValue(result),
    ...overrides,
  };
  render(<AuthPanel {...props} />);
  return props;
};

describe('AuthPanel', () => {
  it('supports register input and password confirmation', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'auth.register.link' }));
    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'StrongPass1' } });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), { target: { value: 'StrongPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.register.submit' }));
    await waitFor(() => expect(props.register).toHaveBeenCalledWith({
      email: 'player@example.com', password: 'StrongPass1', passwordConfirm: 'StrongPass1',
    }));
  });

  it('supports login and forgot password requests', async () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'StrongPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.login.submit' }));
    await waitFor(() => expect(props.login).toHaveBeenCalledWith({ email: 'player@example.com', password: 'StrongPass1' }));
    expect(props.setRememberMe).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'auth.forgot.link' }));
    fireEvent.click(screen.getByRole('button', { name: 'auth.forgot.submit' }));
    await waitFor(() => expect(props.forgotPassword).toHaveBeenCalledWith({ email: 'player@example.com' }));
  });

  it('defaults Remember Me on and persists changes for an authenticated session', async () => {
    const authenticated = { ...anonymous, status: 'authenticated' as const, user: { id: '1', email: 'p@e.test', emailVerified: true, role: 'user' as const } };
    const props = renderPanel(authenticated);
    const checkbox = screen.getByRole('checkbox', { name: 'auth.rememberMe' });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(props.setRememberMe).toHaveBeenCalledWith(false));
    expect(props.logout).not.toHaveBeenCalled();
  });

  it('shows password recovery and submits a new password', async () => {
    const recovery = { ...anonymous, status: 'authenticated' as const, passwordRecoveryPending: true, user: { id: '1', email: 'p@e.test', emailVerified: true, role: 'user' as const } };
    const recoveryProps = renderPanel(recovery);
    expect(screen.getByRole('heading', { name: 'auth.reset.title' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'ChangedPass2' } });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), { target: { value: 'ChangedPass2' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.reset.submit' }));
    await waitFor(() => expect(recoveryProps.updatePassword).toHaveBeenCalledWith({ password: 'ChangedPass2', passwordConfirm: 'ChangedPass2' }));
  });

  it('logs out an authenticated user', async () => {
    const authenticated = { ...anonymous, status: 'authenticated' as const, user: { id: '1', email: 'p@e.test', emailVerified: true, role: 'user' as const } };
    const props = renderPanel(authenticated);
    fireEvent.click(screen.getByRole('button', { name: 'auth.logout' }));
    await waitFor(() => expect(props.logout).toHaveBeenCalledOnce());
  });

  it('does not pretend auth works when configuration is missing', () => {
    renderPanel({ ...anonymous, status: 'configurationRequired' });
    expect(screen.getByText('auth.configurationRequired')).toBeInTheDocument();
    expect(screen.queryByLabelText('auth.password')).not.toBeInTheDocument();
  });
});
