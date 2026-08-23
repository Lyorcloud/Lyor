import { useEffect, useRef, useState } from 'react';

import { SidebarArrow } from './SidebarArrow';

export interface ProductDestination {
  readonly available: boolean;
  readonly description: string;
  readonly id: 'lyor' | 'planaria';
  readonly label: string;
}

interface ProductSwitcherProps {
  readonly currentProductId?: ProductDestination['id'];
  readonly currentLabel: string;
  readonly destinations: readonly ProductDestination[];
  readonly label: string;
  readonly onSelect: (destination: ProductDestination) => void;
  readonly unavailableLabel: string;
  readonly visible?: boolean;
}

export function ProductSwitcher({
  currentLabel,
  currentProductId = 'lyor',
  destinations,
  label,
  onSelect,
  unavailableLabel,
  visible = true,
}: ProductSwitcherProps) {
  const [open, setOpen] = useState(false);
  const focusLastItemRef = useRef(false);
  const focusMenuOnOpenRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openMenu = (focusLastItem = false) => {
    focusLastItemRef.current = focusLastItem;
    focusMenuOnOpenRef.current = true;
    setOpen(true);
  };

  const focusMenuItem = (focusLastItem = false) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLastItem ? items.length - 1 : 0]?.focus();
  };

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
    if (!open || !focusMenuOnOpenRef.current) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLastItemRef.current ? items.length - 1 : 0]?.focus();
    focusLastItemRef.current = false;
    focusMenuOnOpenRef.current = false;
  }, [open]);

  useEffect(() => {
    if (visible) return;
    const frame = window.requestAnimationFrame(() => setOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div className="product-switcher" ref={rootRef}>
      <button
        aria-controls="product-switcher-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="product-switcher__trigger"
        onClick={() => {
          focusMenuOnOpenRef.current = false;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (open) focusMenuItem(event.key === 'ArrowUp');
            else openMenu(event.key === 'ArrowUp');
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <img
          alt=""
          aria-hidden="true"
          className="product-switcher__logo"
          src="./assets/lyor/app-logo.png"
        />
        <span className="product-switcher__label">{currentLabel}</span>
        <span className="product-switcher__arrow"><SidebarArrow direction="down" /></span>
      </button>
      <div
        aria-hidden={!open}
        aria-label={label}
        className="product-switcher__popover"
        data-open={open}
        id="product-switcher-menu"
        inert={!open}
        onKeyDown={handleMenuKeyDown}
        ref={menuRef}
        role="menu"
      >
        {destinations.map((destination) => (
          <button
            aria-current={destination.id === currentProductId ? 'page' : undefined}
            aria-label={`${destination.label}. ${destination.description}${destination.available ? '' : `. ${unavailableLabel}`}`}
            className="product-switcher__item"
            key={destination.id}
            onClick={() => { onSelect(destination); if (destination.available) setOpen(false); }}
            role="menuitem"
            type="button"
          >
            <span className="product-switcher__item-title">{destination.label}</span>
            <small>{destination.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
