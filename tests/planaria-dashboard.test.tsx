import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LyorPlanariaApi, PlanariaDashboardSnapshot } from '../electron/shared/planaria';
import type { LyorUpdaterApi } from '../electron/shared/updater';
import { PlanariaPage } from '../src/components/PlanariaPage';
import { I18nProvider } from '../src/i18n/I18nProvider';

const snapshot: PlanariaDashboardSnapshot = {
  access: { role: 'super_admin', canManageAdmins: true },
  stats: { totalMods: 1, publishedMods: 0, completedDownloads: 12, activeBillboards: 0, adminAccounts: 1 },
  games: [
    { id: 'game-synthetic-fixture', edition: 'standard', displayName: 'Synthetic Fixture', enabled: true },
    { id: 'game-red-dead-redemption-2', edition: 'standard', displayName: 'Red Dead Redemption 2', enabled: true },
  ],
  mods: [{ id: 'sample-mod', name: 'Sample Mod', summary: 'Fixture', gameId: 'game-synthetic-fixture', state: 'draft', createdAt: '2026-08-21T00:00:00Z', updatedAt: '2026-08-21T00:00:00Z' }],
  versions: [], packages: [], media: [], billboards: [],
  accounts: [{ id: '00000000-0000-4000-8000-000000000001', email: 'root@example.test', username: 'root', role: 'super_admin', canManageAdmins: true, createdAt: '2026-08-21T00:00:00Z', lastSignInAt: null }],
  recentActivity: [],
};

const updater: LyorUpdaterApi = {
  getState: vi.fn().mockResolvedValue({ status: 'idle', currentVersion: '1.2.0', availableVersion: null, progress: null, releaseDate: null, releaseNotes: null, lastCheckedAt: null, error: null }),
  checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), restartAndInstall: vi.fn(),
  getAutoCheckEnabled: vi.fn().mockResolvedValue(true), setAutoCheckEnabled: vi.fn(),
  onStateChange: vi.fn().mockReturnValue(() => undefined),
};

describe('Planaria dashboard', () => {
  beforeEach(() => {
    const planaria: LyorPlanariaApi = {
      getDashboard: vi.fn().mockResolvedValue(snapshot), getPublicBillboards: vi.fn().mockResolvedValue([]),
      selectFile: vi.fn().mockResolvedValue(null), selectModContent: vi.fn().mockResolvedValue(null), saveDraft: vi.fn(), uploadModContent: vi.fn(),
      selectTargetPath: vi.fn().mockResolvedValue({ relativePath: 'mods/update/content' }),
      uploadModMedia: vi.fn(), uploadBillboard: vi.fn(), transitionVersion: vi.fn(),
      mutateBillboard: vi.fn(), createAdmin: vi.fn(), onUploadProgress: vi.fn().mockReturnValue(() => undefined),
    };
    Object.defineProperty(window, 'lyorPlanaria', { configurable: true, value: planaria });
    Object.defineProperty(window, 'lyorUpdater', { configurable: true, value: updater });
    window.localStorage.setItem('lyor.locale.v1', 'en');
  });

  it('loads protected statistics and exposes all real management sections', async () => {
    render(<I18nProvider><PlanariaPage /></I18nProvider>);
    expect(await screen.findByText('Total mods')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    for (const label of ['Mod management', 'Mod Upload', 'Billboards', 'Admin Accounts', 'Releases & Updater']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('keeps admin creation behind server-provided management permission', async () => {
    render(<I18nProvider><PlanariaPage /></I18nProvider>);
    await screen.findByText('Total mods');
    fireEvent.click(screen.getByRole('button', { name: 'Admin Accounts' }));
    expect(screen.getByRole('button', { name: 'Create admin' })).toBeInTheDocument();
    expect(screen.getByText('root@example.test')).toBeInTheDocument();
    await waitFor(() => expect(window.lyorPlanaria.getDashboard).toHaveBeenCalledTimes(1));
  });

  it('searches the game catalog by alias and selects a safe target through the native picker', async () => {
    render(<I18nProvider><PlanariaPage /></I18nProvider>);
    await screen.findByText('Total mods');
    fireEvent.click(screen.getByRole('button', { name: 'Mod Upload' }));
    const gameSearch = screen.getByRole('combobox', { name: 'Game' });
    fireEvent.change(gameSearch, { target: { value: 'red dead' } });
    fireEvent.click(screen.getByRole('option', { name: /Red Dead Redemption 2/u }));
    expect(gameSearch).toHaveValue('Red Dead Redemption 2');

    fireEvent.click(screen.getByRole('button', { name: 'Choose with File Explorer' }));
    await waitFor(() => expect(window.lyorPlanaria.selectTargetPath).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('textbox', { name: 'Selected relative destination path' })).toHaveValue('mods/update/content');
  });
});
