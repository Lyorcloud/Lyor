import type { UpdateError, UpdateErrorCode } from '../shared/updater';

const MAX_LOG_MESSAGE_LENGTH = 1_000;

export type UpdateAction = 'check' | 'download';

export const sanitizeUpdateLogMessage = (message: unknown): string => {
  if (message instanceof Error) return sanitizeUpdateLogMessage(`${message.name}: ${message.message}`);
  if (typeof message !== 'string') return '[updater details omitted]';
  return message
    .replace(/https?:\/\/\S+/giu, '[update-url]')
    .replace(/\b[a-z]:\\(?:[^\\/:*?"<>|'\r\n]+\\)*[^\\/:*?"<>|'\r\n]*/giu, '[local-path]')
    .replace(/\\\\[^\\\s'"]+\\[^'"\r\n]*/gu, '[local-path]')
    .replace(/\b\/(?:users|home|tmp|var)\/[^\s'"]+/giu, '[local-path]')
    .replace(/\b(authorization|cookie|password|secret|token)\s*[:=]\s*\S+/giu, '$1=[redacted]')
    .replace(/\b(?:ghp|github_pat)_[a-z0-9_]+\b/giu, '[redacted-token]')
    .slice(0, MAX_LOG_MESSAGE_LENGTH);
};

export const normalizeUpdateVersion = (version: unknown): string | null => {
  if (typeof version !== 'string') return null;
  const normalized = version.trim();
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9a-z.-]+)?$/iu.test(normalized) ? normalized : null;
};

const numericVersion = (version: string): readonly number[] | null => {
  const normalized = normalizeUpdateVersion(version);
  if (!normalized) return null;
  const [core, prerelease] = normalized.split('-', 2);
  if (prerelease) return null;
  return (core ?? '').split('.').map((part) => Number(part));
};

export const isStrictVersionUpgrade = (current: string, candidate: string): boolean => {
  const left = numericVersion(current);
  const right = numericVersion(candidate);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if ((right[index] ?? 0) !== (left[index] ?? 0)) return (right[index] ?? 0) > (left[index] ?? 0);
  }
  return false;
};

export const classifyUpdateError = (error: unknown, action: UpdateAction): UpdateError => {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = raw.toLowerCase();
  if (['sha512', 'checksum', 'signature', 'downgrade', 'same version', 'invalid version'].some((token) => normalized.includes(token))) {
    return { code: 'updateRejected', message: 'The update failed integrity or version policy checks.' };
  }
  if (normalized.includes('app-update.yml') || normalized.includes('update config') || normalized.includes('no published versions')) {
    return { code: 'updateConfigurationMissing', message: 'Updates are not configured for this build.' };
  }
  if (['enotfound', 'econnrefused', 'econnreset', 'etimedout', 'net::', 'network', 'timeout'].some((token) => normalized.includes(token))) {
    return { code: 'networkUnavailable', message: 'The update service could not be reached. Try again later.' };
  }
  const code: UpdateErrorCode = action === 'download' ? 'downloadFailed' : 'checkFailed';
  return { code, message: action === 'download'
    ? 'The update could not be downloaded. Try again later.'
    : 'Updates could not be checked. Try again later.' };
};
