import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModCard } from '../src/components/ModCard';
import { mockMods } from '../src/data/mockMods';
import { I18nProvider } from '../src/i18n/I18nProvider';

function renderCard(installPhase: 'success' | 'failure') {
  const mod = mockMods[0]!;
  return render(<I18nProvider><ModCard favorite={false} installPhase={installPhase} installed={false} libraryState="not-installed" mod={mod} mode="library" /></I18nProvider>);
}

describe('ModCard state presentation', () => {
  it('draws the rounded success check only for Success', () => {
    const { container, unmount } = renderCard('success');
    expect(screen.getByRole('button', { name: /Success|Başarılı/ })).toBeInTheDocument();
    expect(container.querySelector('.success-check')).toBeInTheDocument();
    unmount();
    const failure = renderCard('failure');
    expect(failure.container.querySelector('.success-check')).not.toBeInTheDocument();
  });

  it('shows explicit Library state and removal action', () => {
    renderCard('failure');
    expect(screen.getByText(/Not Installed on this PC|Bu bilgisayarda kurulu değil/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove from Library|Kütüphaneden Kaldır/ })).toBeInTheDocument();
  });
});
