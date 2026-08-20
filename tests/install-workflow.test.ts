import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMockInstallPhase, getMockModState, removeMockLibraryEntry, resetMockModServiceForTests, runMockInstallWorkflow } from '../src/services/mockModService';

describe('mock install workflow', () => {
  beforeEach(() => { localStorage.clear(); resetMockModServiceForTests(); vi.useFakeTimers(); });

  it('moves Downloading → Installing → Success and updates only mock local state', async () => {
    const operation = runMockInstallWorkflow('script-hook-v-gta-v', { stepMs: 100 });
    expect(getMockInstallPhase('script-hook-v-gta-v')).toBe('downloading');
    await vi.advanceTimersByTimeAsync(100);
    expect(getMockInstallPhase('script-hook-v-gta-v')).toBe('installing');
    await vi.advanceTimersByTimeAsync(100);
    expect(getMockInstallPhase('script-hook-v-gta-v')).toBe('success');
    expect(getMockModState().installedModIds).toContain('script-hook-v-gta-v');
    await vi.advanceTimersByTimeAsync(100);
    await operation;
    expect(getMockInstallPhase('script-hook-v-gta-v')).toBe('idle');
  });

  it('shows failure without changing installed state', async () => {
    const operation = runMockInstallWorkflow('simple-trainer-rdr2', { fail: true, stepMs: 100 });
    await vi.advanceTimersByTimeAsync(200);
    await operation;
    expect(getMockInstallPhase('simple-trainer-rdr2')).toBe('failure');
    expect(getMockModState().installedModIds).not.toContain('simple-trainer-rdr2');
  });

  it('keeps physical mock truth separate when removing cloud-library membership', () => {
    const before = getMockModState();
    expect(before.installedModIds).toContain('rampage-trainer-rdr2');
    removeMockLibraryEntry('rampage-trainer-rdr2');
    const after = getMockModState();
    expect(after.libraryEntries.some((entry) => entry.modId === 'rampage-trainer-rdr2')).toBe(false);
    expect(after.installedModIds).toContain('rampage-trainer-rdr2');
  });
});
