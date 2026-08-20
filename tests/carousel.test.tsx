import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomeBillboard } from '../src/components/HomeBillboard';
import type { HomeBillboardItem } from '../src/data/mockBillboards';

const items: readonly HomeBillboardItem[] = [
  { id: 'image', alt: 'Image slide', kind: 'image', src: '/image.png', published: true, displayOrder: 1 },
  { id: 'video', alt: 'Video slide', kind: 'video', src: '/video.mp4', published: true, displayOrder: 2 },
];

function renderCarousel(carouselItems = items) {
  return render(<HomeBillboard fallbackLabel="Unavailable" items={carouselItems} nextLabel="Next" previousLabel="Previous" />);
}

describe('Home billboard carousel', () => {
  it('keeps images for three seconds and advances videos only when they end', async () => {
    vi.useFakeTimers();
    renderCarousel();
    expect(screen.getByAltText('Image slide')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2_999));
    expect(screen.getByAltText('Image slide')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    const video = screen.getByLabelText('Video slide');
    expect(video).toBeInTheDocument();
    fireEvent.ended(video);
    expect(screen.getByAltText('Image slide')).toBeInTheDocument();
  });

  it('resets manual navigation and falls back safely for broken media', async () => {
    vi.useFakeTimers();
    renderCarousel();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Video slide')).toBeInTheDocument();
    fireEvent.error(screen.getByLabelText('Video slide'));
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByAltText('Image slide')).toBeInTheDocument();
  });

  it('settles on a fallback when every local media item is broken', async () => {
    vi.useFakeTimers();
    renderCarousel();
    fireEvent.error(screen.getByAltText('Image slide'));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    fireEvent.error(screen.getByLabelText('Video slide'));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});
