import { useEffect, useRef, useState } from 'react';

export interface ProductDestination {
  readonly available: boolean;
  readonly id: 'lyor' | 'planaria';
  readonly label: string;
}

interface ProductSwitcherProps {
  readonly currentLabel: string;
  readonly destinations: readonly ProductDestination[];
  readonly label: string;
  readonly onSelect: (destination: ProductDestination) => void;
  readonly unavailableLabel: string;
}

export function ProductSwitcher({ currentLabel, destinations, label, onSelect, unavailableLabel }: ProductSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  return (
    <div className="product-switcher" ref={rootRef}>
      <button aria-expanded={open} aria-haspopup="menu" aria-label={label} className="product-switcher__trigger" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
        <span>{currentLabel}</span><span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div aria-label={label} className="product-switcher__popover" role="menu">
          {destinations.map((destination) => (
            <button
              aria-current={destination.id === 'lyor' ? 'page' : undefined}
              className="product-switcher__item"
              key={destination.id}
              onClick={() => { onSelect(destination); if (destination.available) setOpen(false); }}
              role="menuitem"
              type="button"
            >
              <span>{destination.label}</span>{!destination.available ? <small>{unavailableLabel}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
