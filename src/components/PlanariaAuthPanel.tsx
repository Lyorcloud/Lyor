import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { AuthResult, AuthState } from '../../electron/shared/auth';
import { useI18n } from '../i18n/I18nContext';

interface PlanariaAuthPanelProps {
  readonly login: (input: { email: string; password: string }) => Promise<AuthResult>;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly pending: boolean;
  readonly state: AuthState;
}

export function PlanariaAuthPanel({ login, onClose, onSuccess, pending, state }: PlanariaAuthPanelProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback('');
    const result = await login({ email, password });
    const role = result.state.user?.role;
    if (result.error) setFeedback(t('planariaAuth.invalid'));
    else if (role !== 'admin' && role !== 'super_admin') {
      await window.planariaAuth.logout();
      setFeedback(t('planariaAuth.denied'));
    } else {
      setPassword('');
      onSuccess();
    }
  };

  return (
    <div className="auth-overlay" data-no-drag onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-labelledby="planaria-auth-title" aria-modal="true" className="auth-dialog" ref={dialogRef} role="dialog">
        <button aria-label={t('auth.close')} className="auth-dialog__close" onClick={onClose} type="button">×</button>
        <p className="auth-dialog__eyebrow">Planaria Control</p>
        <h2 id="planaria-auth-title">{t('planariaAuth.title')}</h2>
        {state.status === 'configurationRequired' ? <p className="auth-dialog__message">{t('auth.configurationRequired')}</p> : (
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>{t('auth.email')}<input autoComplete="username" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
            <label>{t('auth.password')}<input autoComplete="current-password" maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
            {feedback ? <p aria-live="polite" className="auth-form__feedback">{feedback}</p> : null}
            <button className="auth-form__primary" disabled={pending} type="submit">{pending ? t('auth.working') : t('planariaAuth.submit')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
