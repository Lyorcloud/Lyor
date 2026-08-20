import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductSwitcher } from '../src/components/ProductSwitcher';

const destinations = [{ id: 'lyor', label: 'Lyor', available: true }, { id: 'planaria', label: 'Planaria', available: false }] as const;

describe('ProductSwitcher', () => {
  it('exposes the Planaria placeholder and closes with Escape/outside click', () => {
    const onSelect = vi.fn();
    render(<><ProductSwitcher currentLabel="Lyor" destinations={destinations} label="Switch product" onSelect={onSelect} unavailableLabel="Coming soon" /><button type="button">Outside</button></>);
    fireEvent.click(screen.getByRole('button', { name: 'Switch product' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Planaria/ }));
    expect(onSelect).toHaveBeenCalledWith(destinations[1]);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch product' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
