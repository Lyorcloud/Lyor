import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductSwitcher } from '../src/components/ProductSwitcher';

const destinations = [
  { id: 'lyor', label: 'Lyor', description: 'Discover, install, play', available: true },
  { id: 'planaria', label: 'Planaria', description: 'Create, Manage, Publish', available: false },
] as const;

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
    expect(screen.getByRole('menu', { hidden: true })).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('menu', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Switch product' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('matches the Figma labels and supports arrow-key menu navigation', () => {
    render(<ProductSwitcher currentLabel="Lyor" destinations={destinations} label="Switch product" onSelect={vi.fn()} unavailableLabel="Coming soon" />);

    const trigger = screen.getByRole('button', { name: 'Switch product' });
    expect(trigger).toHaveTextContent('Lyor❮');
    expect(trigger.querySelector('.sidebar-arrow--down')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const lyor = screen.getByRole('menuitem', { name: 'Lyor. Discover, install, play' });
    const planaria = screen.getByRole('menuitem', { name: 'Planaria. Create, Manage, Publish. Coming soon' });
    expect(lyor).toHaveFocus();
    fireEvent.keyDown(lyor, { key: 'ArrowDown' });
    expect(planaria).toHaveFocus();
    fireEvent.keyDown(planaria, { key: 'Home' });
    expect(lyor).toHaveFocus();
  });
});
