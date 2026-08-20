import { describe, expect, it } from 'vitest';

import { classifyUpdateError, isStrictVersionUpgrade, normalizeUpdateVersion, sanitizeUpdateLogMessage } from '../electron/main/update-policy';

describe('updater release policy', () => {
  it('accepts only strict stable upgrades and rejects same/downgrade/invalid metadata', () => {
    expect(isStrictVersionUpgrade('1.2.0', '1.2.1')).toBe(true);
    expect(isStrictVersionUpgrade('1.2.1', '1.2.1')).toBe(false);
    expect(isStrictVersionUpgrade('1.2.1', '1.2.0')).toBe(false);
    expect(isStrictVersionUpgrade('1.2.0', '1.2.1-beta.1')).toBe(false);
    expect(normalizeUpdateVersion('not-a-version')).toBeNull();
  });

  it('classifies offline, missing metadata, corrupt/signature, and generic failures safely', () => {
    expect(classifyUpdateError(new Error('ETIMEDOUT'), 'check').code).toBe('networkUnavailable');
    expect(classifyUpdateError(new Error('app-update.yml missing'), 'check').code).toBe('updateConfigurationMissing');
    expect(classifyUpdateError(new Error('sha512 checksum mismatch'), 'download').code).toBe('updateRejected');
    expect(classifyUpdateError(new Error('unknown'), 'download').code).toBe('downloadFailed');
  });

  it('redacts update URLs, credentials, tokens, and local paths', () => {
    const safe = sanitizeUpdateLogMessage('https://host/latest.yml?token=secret Authorization: Bearer-abc C:\\Users\\alice\\file github_pat_secret');
    expect(safe).not.toMatch(/host|secret|alice|Bearer-abc/u);
  });
});
