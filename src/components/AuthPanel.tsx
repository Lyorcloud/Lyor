import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { AuthErrorCode, AuthResult, AuthState } from '../../electron/shared/auth';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n';

type AuthView = 'login' | 'register' | 'forgot' | 'reset';

const titleKeys: Record<AuthView, TranslationKey> = {
  login: 'auth.login.title', register: 'auth.register.title', forgot: 'auth.forgot.title', reset: 'auth.reset.title',
};
const submitKeys: Record<AuthView, TranslationKey> = {
  login: 'auth.login.submit', register: 'auth.register.submit', forgot: 'auth.forgot.submit', reset: 'auth.reset.submit',
};
const errorKeys: Record<AuthErrorCode, TranslationKey> = {
  configurationUnavailable: 'auth.error.configurationUnavailable',
  invalidInput: 'auth.error.invalidInput',
  invalidCredentials: 'auth.error.invalidCredentials',
  emailNotVerified: 'auth.error.emailNotVerified',
  emailAlreadyRegistered: 'auth.error.emailAlreadyRegistered',
  passwordTooWeak: 'auth.error.passwordTooWeak',
  rateLimited: 'auth.error.rateLimited',
  sessionExpired: 'auth.error.sessionExpired',
  networkUnavailable: 'auth.error.networkUnavailable',
  requestFailed: 'auth.error.requestFailed',
};

interface AuthActions {
  readonly forgotPassword: (input: { email: string }) => Promise<AuthResult>;
  readonly login: (input: { email: string; password: string }) => Promise<AuthResult>;
  readonly logout: () => Promise<AuthResult>;
  readonly setRememberMe: (enabled: boolean) => Promise<AuthResult>;
  readonly register: (input: { email: string; password: string; passwordConfirm: string }) => Promise<AuthResult>;
  readonly updatePassword: (input: { password: string; passwordConfirm: string }) => Promise<AuthResult>;
}

interface AuthPanelProps extends AuthActions {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly state: AuthState;
  readonly onAuthenticated?: () => void;
}

export function AuthPanel({
  forgotPassword,
  login,
  logout,
  setRememberMe,
  onClose,
  open,
  pending,
  register,
  state,
  onAuthenticated,
  updatePassword,
}: AuthPanelProps) {
  const { t } = useI18n();
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rememberMe, setRememberMeState] = useState(state.rememberMe);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const activeView: AuthView = state.passwordRecoveryPending ? 'reset' : view;

  const complete = async (request: Promise<AuthResult>, notifyAuthenticated = true) => {
    const result = await request;
    if (result.error) {
      setFeedback(t(errorKeys[result.error.code]));
      return;
    }
    if (result.notice === 'verificationSent') setFeedback(t('auth.notice.verificationSent'));
    if (result.notice === 'resetSent') setFeedback(t('auth.notice.resetSent'));
    if (result.notice === 'passwordUpdated') setFeedback(t('auth.notice.passwordUpdated'));
    if (result.state.status === 'authenticated' && !result.state.passwordRecoveryPending) {
      setPassword('');
      setPasswordConfirm('');
      if (notifyAuthenticated) onAuthenticated?.();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFeedback('');
    if (activeView === 'login') void (async () => {
      const preference = await setRememberMe(rememberMe);
      if (preference.error) {
        setFeedback(t(errorKeys[preference.error.code]));
        return;
      }
      await complete(login({ email, password }));
    })();
    if (activeView === 'register') void complete(register({ email, password, passwordConfirm }));
    if (activeView === 'forgot') void complete(forgotPassword({ email }));
    if (activeView === 'reset') void complete(updatePassword({ password, passwordConfirm }));
  };

  const showAuthenticated = state.status === 'authenticated' && !state.passwordRecoveryPending;
  const title = showAuthenticated ? t('auth.account') : t(titleKeys[activeView]);

  return (
    <div className="auth-overlay" data-no-drag onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div aria-labelledby="auth-title" aria-modal="true" className="auth-dialog" ref={dialogRef} role="dialog">
        <button aria-label={t('auth.close')} className="auth-dialog__close" onClick={onClose} type="button">×</button>
        <p className="auth-dialog__eyebrow">Lyor Cloud</p>
        <h2 id="auth-title">{title}</h2>

        {state.status === 'configurationRequired' ? (
          <p className="auth-dialog__message">{t('auth.configurationRequired')}</p>
        ) : showAuthenticated ? (
          <div className="auth-account">
            <p>{state.user?.email}</p>
            <span>{t('auth.verified')}</span>
            <label className="auth-form__remember"><input checked={rememberMe} onChange={(event) => {
              const enabled = event.target.checked;
              setRememberMeState(enabled);
              void complete(setRememberMe(enabled), false);
            }} type="checkbox" />{t('auth.rememberMe')}</label>
            <button disabled={pending} onClick={() => void complete(logout())} type="button">{t('auth.logout')}</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            {activeView !== 'reset' ? (
              <label>{t('auth.email')}<input autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
            ) : null}
            {activeView !== 'forgot' ? (
              <label>{t('auth.password')}<input autoComplete={activeView === 'login' ? 'current-password' : 'new-password'} maxLength={128} minLength={activeView === 'login' ? 1 : 8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            ) : null}
            {activeView === 'register' || activeView === 'reset' ? (
              <label>{t('auth.confirmPassword')}<input autoComplete="new-password" maxLength={128} minLength={8} onChange={(event) => setPasswordConfirm(event.target.value)} required type="password" value={passwordConfirm} /></label>
            ) : null}
            {activeView === 'login' ? <label className="auth-form__remember"><input checked={rememberMe} onChange={(event) => setRememberMeState(event.target.checked)} type="checkbox" />{t('auth.rememberMe')}</label> : null}
            {feedback ? <p aria-live="polite" className="auth-form__feedback">{feedback}</p> : null}
            <button className="auth-form__primary" disabled={pending} type="submit">{pending ? t('auth.working') : t(submitKeys[activeView])}</button>
            {activeView === 'login' ? (
              <div className="auth-form__links"><button onClick={() => setView('forgot')} type="button">{t('auth.forgot.link')}</button><button onClick={() => setView('register')} type="button">{t('auth.register.link')}</button></div>
            ) : activeView !== 'reset' ? (
              <button className="auth-form__back" onClick={() => setView('login')} type="button">{t('auth.backToLogin')}</button>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
